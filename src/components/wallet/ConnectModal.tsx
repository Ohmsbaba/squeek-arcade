"use client";
import dynamic from "next/dynamic";
import { create } from "zustand";
import { Modal } from "@/components/ui/Modal";

const WalletFlow = dynamic(() => import("./WalletFlow"), {
  ssr: false,
  loading: () => <p className="py-6 text-center font-data text-sm text-gray">Warming up the wallet bench…</p>,
});

export const useConnectModal = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export function ConnectModal() {
  const { open, hide } = useConnectModal();
  return (
    <Modal open={open} onClose={hide} title="Connect wallet">
      {open && <WalletFlow onDone={hide} />}
    </Modal>
  );
}
