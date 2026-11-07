import type { Metadata } from "next";
import { ProfilePage } from "@/components/community/ProfilePage";

export const metadata: Metadata = { title: "Your profile" };

export default function Page() {
  return <ProfilePage />;
}
