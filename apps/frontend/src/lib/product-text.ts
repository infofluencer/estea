/**
 * WooCommerce'tan taşınan açıklamalarda kalan kısa kodları (`[video …][/video]`,
 * `[caption]` vb.) ve HTML etiketlerini ayıklar; paragraf aralarını korur.
 */
export function cleanProductText(text?: string | null): string {
  return (text || "")
    .replace(/\[(\w+)[^\]]*\][\s\S]*?\[\/\1\]/g, "")
    .replace(/\[\/?\w+[^\]]*\]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
