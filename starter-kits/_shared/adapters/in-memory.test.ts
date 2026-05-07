import { describe, expect, it } from "vitest";
import { inMemoryRepository } from "./in-memory.ts";
import { NotFoundError } from "./repository.ts";

interface Item {
  id: string;
  tenantId: string;
  name: string;
  status: "open" | "done";
}

describe("inMemoryRepository", () => {
  it("isolates writes by tenantId", async () => {
    const repo = inMemoryRepository<Item>("Item");
    const a = await repo.create("tenant-a", { name: "x", status: "open" });
    const b = await repo.create("tenant-b", { name: "y", status: "open" });

    expect(await repo.get("tenant-a", a.id)).toEqual(a);
    expect(await repo.get("tenant-b", a.id)).toBeNull();
    expect(await repo.get("tenant-a", b.id)).toBeNull();
  });

  it("filters list() by tenantId", async () => {
    const repo = inMemoryRepository<Item>("Item");
    await repo.create("t1", { name: "a", status: "open" });
    await repo.create("t1", { name: "b", status: "open" });
    await repo.create("t2", { name: "c", status: "open" });

    const t1Page = await repo.list("t1");
    const t2Page = await repo.list("t2");
    expect(t1Page.items.map((i) => i.name).sort()).toEqual(["a", "b"]);
    expect(t2Page.items.map((i) => i.name)).toEqual(["c"]);
  });

  it("applies where filter", async () => {
    const repo = inMemoryRepository<Item>("Item");
    await repo.create("t", { name: "a", status: "open" });
    await repo.create("t", { name: "b", status: "done" });

    const open = await repo.list("t", { where: { status: "open" } });
    expect(open.items.map((i) => i.name)).toEqual(["a"]);
  });

  it("update fails NotFoundError across tenants", async () => {
    const repo = inMemoryRepository<Item>("Item");
    const a = await repo.create("t1", { name: "a", status: "open" });
    await expect(repo.update("t2", a.id, { name: "x" })).rejects.toThrow(NotFoundError);
  });

  it("delete fails NotFoundError across tenants", async () => {
    const repo = inMemoryRepository<Item>("Item");
    const a = await repo.create("t1", { name: "a", status: "open" });
    await expect(repo.delete("t2", a.id)).rejects.toThrow(NotFoundError);
    expect(await repo.get("t1", a.id)).not.toBeNull();
  });

  it("paginates with cursor", async () => {
    const repo = inMemoryRepository<Item>("Item");
    for (let i = 0; i < 5; i++) {
      await repo.create("t", { name: `n${i}`, status: "open" });
    }
    const page1 = await repo.list("t", { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBe("2");

    const page2 = await repo.list("t", { limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBe("4");

    const page3 = await repo.list("t", { limit: 2, cursor: page2.nextCursor! });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
  });
});
