import { model } from "@medusajs/framework/utils"

const WishlistItem = model
  .define("wishlist_item", {
    id: model.id().primaryKey(),
    customer_id: model.text().searchable(),
    product_id: model.text().searchable(),
    product_handle: model.text(),
    product_title: model.text(),
    product_thumbnail: model.text().nullable(),
    product_price: model.number().nullable(),
  })
  .indexes([
    {
      on: ["customer_id", "product_id"],
      unique: true,
    },
    {
      on: ["customer_id"],
    },
  ])

export default WishlistItem
