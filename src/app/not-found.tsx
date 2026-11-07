import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="title text-6xl text-gold">Nothing here</p>
      <p className="text-sm text-lit">That burrow doesn&apos;t go anywhere.</p>
      <Link href="/" className="key key-gold h-12 px-6 text-lg">Back to the lobby</Link>
    </div>
  );
}
