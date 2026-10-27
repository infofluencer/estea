import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261008104436 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ops_event" ("id" text not null, "kind" text not null, "level" text check ("level" in ('info', 'warning', 'error')) not null default 'info', "title" text not null, "detail" text null, "order_id" text null, "order_display_id" text null, "data" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ops_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_deleted_at" ON "ops_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_order_id" ON "ops_event" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_kind" ON "ops_event" ("kind") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ops_event_level" ON "ops_event" ("level") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ops_event" cascade;`);
  }

}
