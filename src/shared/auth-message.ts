export function signInMessage(address: string, nonce: string, host: string) {
  return [
    `${host} wants you to sign in to Squeek Arcade with:`,
    address,
    "",
    "This only proves you control this wallet. It costs nothing and can't move or approve anything.",
    "",
    `Nonce: ${nonce}`,
  ].join("\n");
}
