"use client";
/**
 * Loaded only when someone asks to connect, so the wallet libraries don't weigh down the arcade.
 * Signing proves control of the address and nothing else: no transactions, no approvals.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getAddress } from "viem";
import { createConfig, http, injected, useAccount, useConnect, useDisconnect, useSignMessage, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
// Not the wagmi/connectors barrel: that drags in every vendor's SDK. See next.config.mjs.
import { walletConnect } from "wagmi-walletconnect";
import { api, ApiError } from "@/client/api";
import { useArcade } from "@/client/store";
import type { Me } from "@/client/types";
import { signInMessage } from "@/shared/auth-message";
import { shortAddress } from "@/client/format";

const wcId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
const config = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), ...(wcId ? [walletConnect({ projectId: wcId, showQrModal: true })] : [])],
  transports: { [sepolia.id]: http() },
  ssr: false,
});
const queryClient = new QueryClient();

function Flow({ onDone }: { onDone: () => void }) {
  const { connectors, connectAsync, isPending } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const setMe = useArcade((s) => s.setMe);
  const toast = useArcade((s) => s.toast);
  const [step, setStep] = useState<"pick" | "sign" | "working">("pick");
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => {
    // The generic entry only helps when no wallet announced itself by name.
    const named = connectors.filter((c) => c.id !== "injected");
    return named.some((c) => c.type === "injected") ? named : connectors;
  }, [connectors]);

  useEffect(() => {
    if (isConnected && step === "pick") setStep("sign");
  }, [isConnected, step]);

  const pick = async (connector: (typeof connectors)[number]) => {
    setError(null);
    try {
      await connectAsync({ connector, chainId: sepolia.id }).catch(async (e) => {
        // A wallet that won't switch to Sepolia can still sign the message. Don't block on the chain.
        if (/chain/i.test(String(e?.message))) return connectAsync({ connector });
        throw e;
      });
    } catch (e) {
      setError((e as Error).message?.split("\n")[0] ?? "Your wallet didn't connect.");
    }
  };

  const sign = async () => {
    if (!address) return;
    setStep("working");
    setError(null);
    try {
      const { nonce } = await api<{ nonce: string }>("/api/auth/nonce", { body: {} });
      const checksummed = getAddress(address);
      const signature = await signMessageAsync({ message: signInMessage(checksummed, nonce, window.location.host) });
      const me = await api<Me>("/api/auth/verify", { body: { address: checksummed, signature, nonce } });
      setMe(me);
      toast({ kind: "info", title: "Wallet connected", body: shortAddress(checksummed) });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : ((e as Error).message?.split("\n")[0] ?? "That didn't work."));
      setStep("sign");
    }
  };

  if (step === "pick") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-lit">Connect to show the Squeeks you hold. Reading them is free, and nothing is ever moved, staked or locked.</p>
        {list.length === 0 && <p className="text-sm text-gray">No wallet found in this browser. Open the arcade in your wallet&apos;s browser, or install one.</p>}
        {list.map((c) => (
          <button key={c.uid} className="key key-dark h-12 text-base" disabled={isPending} onClick={() => pick(c)}>
            {c.name === "Injected" ? "Browser wallet" : c.name}
          </button>
        ))}
        {error && <p role="alert" className="text-sm text-reactor">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="font-data text-sm text-paper">{address && shortAddress(address)}</p>
      <p className="text-sm leading-relaxed text-lit">Sign one message to prove this wallet is yours. It costs nothing and can&apos;t move or approve anything.</p>
      <button className="key key-gold h-12 text-lg" disabled={step === "working"} onClick={sign}>
        {step === "working" ? "Check your wallet…" : "Sign in"}
      </button>
      <button className="link self-start text-xs" onClick={async () => { await disconnectAsync(); setStep("pick"); }}>Use a different wallet</button>
      {error && <p role="alert" className="text-sm text-reactor">{error}</p>}
    </div>
  );
}

export default function WalletFlow({ onDone }: { onDone: () => void }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Flow onDone={onDone} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
