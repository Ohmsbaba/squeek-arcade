import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";

/** Hardhat's first public test key: for signing a sign-in message against the local server, nothing else. */
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const TEST_ACCOUNT = privateKeyToAccount(TEST_KEY);

/** The value behind the chip, not its counting animation. */
export const balance = async (page: Page) => Number(await page.getByTestId("balance").getAttribute("data-value"));

export async function ready(page: Page) {
  await expect(page.getByTestId("balance")).toHaveAttribute("data-value", /\d/);
}

/** A minimal EIP-1193 wallet, announced the EIP-6963 way, backed by the test key. */
export async function installMockWallet(context: BrowserContext) {
  await context.exposeFunction("__mockSign", (message: string) => TEST_ACCOUNT.signMessage({ message }));
  await context.addInitScript((address: string) => {
    const hexToText = (hex: string) => new TextDecoder().decode(Uint8Array.from(hex.slice(2).match(/../g)!.map((b) => parseInt(b, 16))));
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const provider = {
      isMockWallet: true,
      on: (e: string, f: (...a: unknown[]) => void) => void (listeners[e] ??= []).push(f),
      removeListener: (e: string, f: (...a: unknown[]) => void) => void (listeners[e] = (listeners[e] ?? []).filter((x) => x !== f)),
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [address];
          case "eth_chainId":
            return "0xaa36a7";
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
            return null;
          case "wallet_requestPermissions":
            return [{ parentCapability: "eth_accounts" }];
          case "personal_sign": {
            const hex = (params as string[])[0];
            return (window as unknown as { __mockSign: (m: string) => Promise<string> }).__mockSign(hexToText(hex));
          }
          default:
            throw new Error(`Mock wallet: ${method} isn't supported. This game should never need it.`);
        }
      },
    };
    (window as unknown as { ethereum: unknown }).ethereum = provider;
    const announce = () =>
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: { uuid: "00000000-0000-4000-8000-000000000001", name: "Mock Wallet", icon: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", rdns: "test.mock" }, provider }) }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, TEST_ACCOUNT.address);
}

export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // A 409/429 we provoke on purpose logs as a failed resource. Everything else counts.
    if (m.type() === "error" && !/status of (401|403|404|409|429)/.test(m.text())) errors.push(m.text());
  });
  return errors;
}
