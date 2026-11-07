import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261105104348 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "paytr_checkout" drop constraint if exists "paytr_checkout_merchant_oid_unique";`);
    this.addSql(`create table if not exists "paytr_checkout" ("id" text not null, "merchant_oid" text not null, "cart_id" text not null, "session_id" text null, "payment_collection_id" text null, "amount_kurus" integer not null, "currency_code" text not null default 'try', "email" text null, "items" jsonb null, "status" text check ("status" in ('pending', 'paid', 'completed', 'review', 'refunded', 'expired')) not null default 'pending', "paid_at" timestamptz null, "paid_kurus" integer null, "paid_source" text null, "order_id" text null, "review_kind" text null, "last_error" text null, "failed_attempts" integer not null default 0, "retry_count" integer not null default 0, "last_polled_at" timestamptz null, "alerted_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "paytr_checkout_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_paytr_checkout_merchant_oid_unique" ON "paytr_checkout" ("merchant_oid") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_paytr_checkout_deleted_at" ON "paytr_checkout" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_paytr_checkout_cart_id" ON "paytr_checkout" ("cart_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_paytr_checkout_status" ON "paytr_checkout" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "paytr_checkout" cascade;`);
  }

}
