import { contractSections, type ContractKind } from "@escay/shared/legal-contracts"

/**
 * Sözleşme metni — shared/legal-contracts (tek kaynak).
 * Backend sipariş PDF'leri aynı kaynaktan, siparişin bilgileriyle basılır.
 */
export function ContractText({ kind }: { kind: ContractKind }) {
  return (
    <>
      {contractSections(kind, null).map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.blocks.map((block, i) =>
            block.type === "p" ? (
              <p key={i}>{block.text}</p>
            ) : block.type === "lines" ? (
              <p key={i}>
                {block.lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </p>
            ) : null
          )}
        </section>
      ))}
    </>
  )
}
