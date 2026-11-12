import { describe, expect, it } from "vitest"
import { sortByProductOrder } from "@/lib/product-order"

describe("sortByProductOrder", () => {
  it("çaylar sabit sırada, tanımsızlar sonra ve kendi sıralarıyla", () => {
    const handles = [
      "papatya-cayi",
      "tiryaki-cayi",
      "gold-karadeniz-cayi",
      "kup-seker",
      "demlik-suzen-poset-cay",
      "karadeniz-cayi",
      "ilk-hasat-cay",
    ]
    expect(sortByProductOrder(handles, (h) => h)).toEqual([
      "ilk-hasat-cay",
      "gold-karadeniz-cayi",
      "karadeniz-cayi",
      "tiryaki-cayi",
      "demlik-suzen-poset-cay",
      "papatya-cayi",
      "kup-seker",
    ])
  })
})
