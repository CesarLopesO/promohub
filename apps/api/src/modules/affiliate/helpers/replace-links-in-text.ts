export type LinkRewrite = {
  originalUrl: string;
  rewrittenUrl: string;
};

export function replaceLinksInText(
  text: string,
  rewrites: LinkRewrite[],
): string {
  return rewrites.reduce(
    (currentText, rewrite) =>
      currentText.split(rewrite.originalUrl).join(rewrite.rewrittenUrl),
    text,
  );
}
