/**
 * Read-only Squeek access. Nothing here can move, burn, stake or lock a token.
 *
 * Addresses come only from the published deployment record, per the Squeekchain docs. The API is
 * for display. Whether a player holds a token is always read from the contracts.
 */
import { createPublicClient, fallback, getAddress, http, isAddress, keccak256, parseAbi, type Address, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";
import snapshot from "./deployment-snapshot.json";
import { db } from "./db";
import { GameError, logError } from "./errors";

const SQUEEK_API_HEADERS = { Accept: "application/json", "User-Agent": "SqueekArcade/1.0 (community game)" };
const DEPLOYMENT_URL = "https://docs.squeekchain.com/assets/deployments/sepolia.json";
const API = "https://api.squeekchain.com/v1";
const SAFE_ART = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/;
const MAX_ART = 400_000;
const DEPLOYMENT_TTL = 10 * 60_000;
const OWNER_TTL = 20_000;
const METADATA_TTL = 24 * 3600_000;

const nftAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function level(uint256 tokenId) view returns (uint8)",
  "function sqkCore() view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);
const stakingAbi = parseAbi(["function depositor(address collection, uint256 tokenId) view returns (address)"]);

const Deployment = z.object({
  chainId: z.literal(11155111),
  release: z.string(),
  contracts: z.object({
    SqueekCore: z.object({ address: z.string() }),
    SqueekNFT: z.object({ address: z.string(), runtimeHash: z.string().optional() }),
    SqueekStaking: z.object({ address: z.string() }),
  }).passthrough(),
}).passthrough();

export type Collection = { nft: Address; core: Address; staking: Address; release: string };

function rpcClient(): PublicClient {
  const own = (process.env.SEPOLIA_RPC_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const urls = [...own, "https://sepolia.gateway.tenderly.co", "https://rpc.sepolia.ethpandaops.io", "https://ethereum-sepolia-rpc.publicnode.com"];
  return createPublicClient({ chain: sepolia, transport: fallback(urls.map((u) => http(u, { timeout: 6000, retryCount: 0 }))) }) as PublicClient;
}

const state: {
  client?: PublicClient;
  collection?: Collection;
  collectionAt?: number;
  owners: Map<string, { at: number; owner: string; level: number }>;
} = { owners: new Map() };

export const client = () => (state.client ??= rpcClient());

/** The published record, or the copy taken from it if the docs can't be read from this server. Checked against the chain either way. */
async function deploymentRecord() {
  try {
    const res = await fetch(DEPLOYMENT_URL, { signal: AbortSignal.timeout(8000), cache: "no-store", headers: SQUEEK_API_HEADERS });
    if (res.ok) return Deployment.parse(await res.json());
  } catch {
    // Fall through to the copy.
  }
  return Deployment.parse(snapshot);
}

/** The live collection, confirmed against the deployment record: right chain, right bytecode, right binding. */
export async function collection(): Promise<Collection> {
  if (state.collection && Date.now() - (state.collectionAt ?? 0) < DEPLOYMENT_TTL) return state.collection;
  try {
    const record = await deploymentRecord();
    const nft = getAddress(record.contracts.SqueekNFT.address);
    const [code, core, chainId] = await Promise.all([
      client().getCode({ address: nft }),
      client().readContract({ address: nft, abi: nftAbi, functionName: "sqkCore" }),
      client().getChainId(),
    ]);
    if (chainId !== 11155111) throw new Error("RPC is not Sepolia");
    const expected = record.contracts.SqueekNFT.runtimeHash;
    if (expected && code && keccak256(code) !== expected) throw new Error("SqueekNFT bytecode doesn't match the deployment record");
    if (getAddress(core) !== getAddress(record.contracts.SqueekCore.address)) throw new Error("SqueekNFT is bound to a different SqueekCore");
    state.collection = { nft, core: getAddress(record.contracts.SqueekCore.address), staking: getAddress(record.contracts.SqueekStaking.address), release: record.release };
    state.collectionAt = Date.now();
    return state.collection;
  } catch (error) {
    await logError("nft.collection", error);
    // A recently verified answer beats none for a cosmetic. Anything older and Squeeks just aren't offered.
    if (state.collection && Date.now() - (state.collectionAt ?? 0) < 6 * DEPLOYMENT_TTL) return state.collection;
    throw new GameError("collection_unavailable", 503, "The Squeek collection can't be verified right now. The arcade token still plays.");
  }
}

/** Who holds a token, for this game's purposes: its wallet owner, or whoever deposited it in staking. */
export async function readHolder(tokenId: number): Promise<{ holder: string; level: number } | null> {
  const cached = state.owners.get(String(tokenId));
  if (cached && Date.now() - cached.at < OWNER_TTL) return { holder: cached.owner, level: cached.level };
  const c = await collection();
  try {
    const [owner, level] = await Promise.all([
      client().readContract({ address: c.nft, abi: nftAbi, functionName: "ownerOf", args: [BigInt(tokenId)] }),
      client().readContract({ address: c.nft, abi: nftAbi, functionName: "level", args: [BigInt(tokenId)] }),
    ]);
    let holder = getAddress(owner);
    if (holder === c.staking) {
      holder = getAddress(await client().readContract({ address: c.staking, abi: stakingAbi, functionName: "depositor", args: [c.nft, BigInt(tokenId)] }));
    }
    if (state.owners.size > 5000) state.owners.clear();
    state.owners.set(String(tokenId), { at: Date.now(), owner: holder, level });
    return { holder, level };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    // ERC721NonexistentToken: unissued or burned in a merge.
    if (/ERC721NonexistentToken|0x7e273289|reverted/i.test(text)) return null;
    await logError("nft.readHolder", error);
    throw new GameError("chain_unavailable", 503, "Sepolia isn't answering right now, so we can't confirm that Squeek. The arcade token still plays.");
  }
}

/** In development, lets a throwaway test wallet stand in for one that holds Squeeks. Never in production. */
function effectiveWallet(address: string): string {
  const alias = process.env.DEV_NFT_ALIAS;
  if (process.env.NODE_ENV === "production" || !alias) return address;
  const [from, to] = alias.split(":");
  return from && to && isAddress(from) && isAddress(to) && getAddress(from) === getAddress(address) ? getAddress(to) : address;
}

const AccountResponse = z.object({
  status: z.string(),
  tokens: z.array(z.object({ tokenId: z.string(), custody: z.string(), level: z.number().nullable() }).passthrough()).optional(),
  nextCursor: z.string().nullable().optional(),
}).passthrough();

async function apiGet<T extends z.ZodTypeAny>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(10_000), cache: "no-store", headers: SQUEEK_API_HEADERS });
  if (!res.ok && res.status !== 404) throw new Error(`Squeek API ${res.status} on ${path.split("?")[0]}`);
  return schema.parse(await res.json());
}

/** Reads a Squeek straight from its tokenURI on-chain, which needs no API at all. */
async function metadataFromChain(tokenId: number) {
  const c = await collection();
  const uri = await client().readContract({ address: c.nft, abi: nftAbi, functionName: "tokenURI", args: [BigInt(tokenId)] });
  const comma = uri.indexOf(",");
  if (!uri.startsWith("data:application/json") || comma < 0) return null;
  const body = uri.slice(comma + 1);
  const text = uri.slice(0, comma).includes("base64") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body);
  const raw = z.object({
    name: z.string().max(200).optional(),
    image: z.string().optional(),
    attributes: z.array(z.object({ trait_type: z.string().max(60), value: z.union([z.string().max(120), z.number(), z.boolean()]) })).max(40).optional(),
  }).parse(JSON.parse(text));
  if (!raw.image || !SAFE_ART.test(raw.image) || raw.image.length > MAX_ART) return null;
  const held = await readHolder(tokenId);
  return {
    name: raw.name ?? `Squeek #${tokenId}`, level: held?.level ?? 1, imageUri: raw.image,
    attributes: (raw.attributes ?? []).map((a) => ({ traitType: a.trait_type, value: a.value })),
  };
}

/** Metadata is public and rarely changes, so it's kept. Treated as data, never placed into markup. */
export async function squeekMetadata(tokenId: number) {
  const row = await db.nft.findUnique({ where: { tokenId } });
  if (row?.imageUri && Date.now() - row.fetchedAt.getTime() < METADATA_TTL) return row;
  try {
    const fields = await metadataFromChain(tokenId);
    if (!fields) return row;
    const data = { ...fields, fetchedAt: new Date() };
    return await db.nft.upsert({ where: { tokenId }, create: { tokenId, ...data }, update: data });
  } catch (error) {
    await logError("nft.metadata", error);
    return row;
  }
}

export type OwnedSqueek = { tokenId: number; name: string; level: number; custody: string; attributes: unknown; imageUrl: string };

/** The Squeeks a wallet holds, for picking one. The API lists them; a play still checks the chain. */
export async function listOwned(address: string): Promise<{ status: "available"; tokens: OwnedSqueek[] } | { status: "unavailable" }> {
  const wallet = effectiveWallet(getAddress(address)).toLowerCase();
  const found: { tokenId: string; custody: string; level: number | null }[] = [];
  let cursor: string | null | undefined;
  try {
    for (let page = 0; page < 5; page++) {
      const q = new URLSearchParams({ limit: "100" });
      if (cursor) q.set("cursor", cursor);
      const data = await apiGet(`/accounts/${wallet}?${q}`, AccountResponse);
      // "unavailable" means unknown, not empty. Never tell a holder they own nothing because the indexer blinked.
      if (data.status !== "available") return { status: "unavailable" };
      found.push(...(data.tokens ?? []));
      cursor = data.nextCursor;
      if (!cursor) break;
    }
  } catch (error) {
    await logError("nft.listOwned", error);
    return { status: "unavailable" };
  }
  const tokens: OwnedSqueek[] = [];
  const queue = [...found];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const tokenId = Number(t.tokenId);
        const meta = await squeekMetadata(tokenId);
        tokens.push({
          tokenId, name: meta?.name ?? `Squeek #${tokenId}`, level: t.level ?? meta?.level ?? 1, custody: t.custody,
          attributes: meta?.attributes ?? [], imageUrl: `/api/nfts/${tokenId}/image`,
        });
      }
    }),
  );
  tokens.sort((a, b) => b.level - a.level || a.tokenId - b.tokenId);
  return { status: "available", tokens };
}

/** Confirms the signed-in wallet holds the token, on-chain, at the moment of the play. */
export async function readSqueekForPlay(userId: string, tokenId: number) {
  const wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new GameError("wallet_required", 403, "Connect the wallet that holds this Squeek first.");
  const held = await readHolder(tokenId);
  if (!held || held.holder !== effectiveWallet(getAddress(wallet.address))) {
    throw new GameError("not_your_squeek", 403, `Squeek #${tokenId} isn't held by your connected wallet.`);
  }
  // The foreign key behind PlayerNft needs a row even when the metadata service is down.
  const meta = await squeekMetadata(tokenId);
  if (!meta) await db.nft.upsert({ where: { tokenId }, create: { tokenId, name: `Squeek #${tokenId}`, level: held.level, imageUri: "", attributes: [], fetchedAt: new Date(0) }, update: {} });
  return { tokenId, level: held.level };
}

/** Decoded art for <img> and textures. Served with a sandboxing policy; never placed into page markup. */
export async function squeekArt(tokenId: number): Promise<string | null> {
  const meta = await squeekMetadata(tokenId);
  if (!meta?.imageUri || !SAFE_ART.test(meta.imageUri)) return null;
  return Buffer.from(meta.imageUri.split(",")[1], "base64").toString("utf8");
}

/** One Squeek's public card: the browser lists tokens from the official API, then asks for these. */
export async function squeekCard(tokenId: number) {
  const meta = await squeekMetadata(tokenId);
  if (!meta) return null;
  return { tokenId, name: meta.name, level: meta.level, attributes: meta.attributes, imageUrl: `/api/nfts/${tokenId}/image` };
}
