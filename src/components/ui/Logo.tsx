import Link from "next/link";
import { DotText } from "./DotText";

export function Logo({ size = 14 }: { size?: number }) {
  return (
    <Link href="/" aria-label="Squeek Arcade lobby" className="group flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/squeekchain-mark.png" alt="" width={size * 1.9} height={size * 1.9} className="rounded-[3px] transition-transform group-hover:-rotate-6" />
      <span className="flex flex-col gap-[3px]">
        <DotText text="SQUEEK" height={size} />
        <DotText text="ARCADE" height={size * 0.72} color="#5b7cfa" />
      </span>
    </Link>
  );
}
