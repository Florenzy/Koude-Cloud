import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    mime: text("mime").notNull().default(""),
    size: integer("size").notNull().default(0),
    parent: text("parent"),
    starred: integer("starred").notNull().default(0),
    trashed: integer("trashed").notNull().default(0),
    created: text("created").notNull(),
    updated: text("updated").notNull(),
    share_token: text("share_token"),
    share_expires: integer("share_expires"),
  },
  (table) => [
    index("entries_owner_parent").on(table.owner, table.parent),
    uniqueIndex("entries_share_token").on(table.share_token),
  ],
);
