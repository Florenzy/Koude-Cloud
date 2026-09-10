"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cloud as CloudIcon,
  Folder,
  Files,
  Star,
  Clock3,
  Link2,
  Trash2,
  Search,
  Upload,
  Plus,
  ChevronRight,
  MoreHorizontal,
  FileText,
  Image as ImageIcon,
  Film,
  File as FileIcon,
  LayoutGrid,
  List,
  Download,
  Pencil,
  RotateCcw,
  LockKeyhole,
  HardDrive,
  ArrowUpRight,
  LogOut,
  LoaderCircle,
  FolderInput,
  X,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  type Entry,
  type User,
  fileCategory,
  formatBytes,
  MAX_FILE,
  QUOTA,
} from "@/lib/types";

type View = "files" | "recent" | "starred" | "shared" | "trash";
type Modal = {
  type: "folder" | "rename" | "share" | "move";
  entry?: Entry;
} | null;
const categories = [
  { id: "document", name: "Documents", icon: FileText },
  { id: "image", name: "Images", icon: ImageIcon },
  { id: "video", name: "Videos", icon: Film },
  { id: "other", name: "Other files", icon: Files },
];
const navigation = [
  { id: "files", label: "My files", icon: Files },
  { id: "recent", label: "Recent", icon: Clock3 },
  { id: "starred", label: "Starred", icon: Star },
  { id: "shared", label: "Shared links", icon: Link2 },
  { id: "trash", label: "Trash", icon: Trash2 },
] as const;
async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/${path}`, {
    ...init,
    headers: {
      ...(typeof init?.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json()) as {
    error?: string;
    entries: Entry[];
    token: string;
    expires: number;
  };
  if (!response.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}
function Symbol({ entry }: { entry: Entry }) {
  const kind = fileCategory(entry.mime);
  const Icon =
    entry.kind === "folder"
      ? Folder
      : (categories.find((c) => c.id === kind)?.icon ?? FileIcon);
  return (
    <span className={`file-symbol ${kind}`}>
      <Icon size={22} strokeWidth={1.5} />
    </span>
  );
}
export default function Cloud({
  user,
  logoutPath,
}: {
  user: User;
  logoutPath: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("files");
  const [parent, setParent] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [grid, setGrid] = useState(false);
  const [sort, setSort] = useState("updated");
  const [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("root");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<Entry | null>(null);
  const [upload, setUpload] = useState<{
    name: string;
    percent: number;
  } | null>(null);
  const [drag, setDrag] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const data = await api("files");
      setEntries(data.entries);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const controller = document as Document & {
      modelContext?: {
        registerTool: (
          tool: unknown,
          options: { signal: AbortSignal },
        ) => void | Promise<void>;
      };
    };
    if (!controller.modelContext) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        controller.modelContext.registerTool(
          {
            name: "search_cloud_files",
            description:
              "Show files matching a name in the signed-in user’s Koude Cloud",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string", maxLength: 180 } },
              required: ["query"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            execute: async (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                !("query" in input) ||
                typeof input.query !== "string" ||
                input.query.length > 180
              )
                throw new Error(
                  "A search query of up to 180 characters is required",
                );
              const query = input.query;
              setSearch(query);
              setView("files");
              setParent(null);
              setCategory("");
              return {
                files: entries
                  .filter(
                    (e) =>
                      !e.trashed &&
                      e.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((e) => ({ id: e.id, name: e.name, kind: e.kind })),
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [entries]);
  const used = entries.reduce((sum, e) => sum + Number(e.size), 0);
  const activeFiles = entries.filter((e) => e.kind === "file" && !e.trashed);
  const folders = entries.filter((e) => e.kind === "folder" && !e.trashed);
  const visible = entries
    .filter((e) => {
      if (Boolean(e.trashed) !== (view === "trash")) return false;
      if (view === "starred" && !e.starred) return false;
      if (
        view === "shared" &&
        (!e.share_token || (e.share_expires ?? 0) <= Date.now())
      )
        return false;
      if (view === "recent" && e.kind !== "file") return false;
      if (view === "files" && !search && !category && e.parent !== parent)
        return false;
      if (search && !e.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (category && (e.kind !== "file" || fileCategory(e.mime) !== category))
        return false;
      return true;
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "size"
          ? b.size - a.size
          : b.updated.localeCompare(a.updated),
    );
  const folderItems = visible.filter((e) => e.kind === "folder");
  const fileItems = visible.filter((e) => e.kind === "file");
  const trail: Entry[] = [];
  let nextParent = parent;
  while (nextParent && trail.length < 50) {
    const found = entries.find((e) => e.id === nextParent);
    if (!found) break;
    trail.unshift(found);
    nextParent = found.parent;
  }
  function navigate(next: View) {
    setView(next);
    setParent(null);
    setCategory("");
    setSearch("");
  }
  function openModal(next: Modal) {
    setModal(next);
    setName(next?.entry?.name ?? "");
    setFormError("");
    setDestination("root");
  }
  async function change(entry: Entry, data: object, message: string) {
    try {
      await api(`files/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      toast.success(message);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function uploadFiles(files: FileList | File[]) {
    if (uploadLock.current) return;
    uploadLock.current = true;
    const target = view === "files" ? parent : null;
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE) {
          toast.error(`${file.name} exceeds 20 MB`);
          continue;
        }
        setUpload({ name: file.name, percent: 0 });
        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const params = new URLSearchParams({ name: file.name });
            if (target) params.set("parent", target);
            xhr.open("POST", `/api/files/upload?${params}`);
            xhr.setRequestHeader(
              "Content-Type",
              file.type || "application/octet-stream",
            );
            xhr.timeout = 120000;
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable)
                setUpload({
                  name: file.name,
                  percent: Math.round((event.loaded / event.total) * 100),
                });
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else {
                let message = "Upload failed";
                try {
                  message = JSON.parse(xhr.responseText).error;
                } catch {}
                reject(new Error(message));
              }
            };
            xhr.onerror = () =>
              reject(new Error("Connection lost. Please retry the upload."));
            xhr.ontimeout = () =>
              reject(new Error("Upload timed out. Please try again."));
            xhr.send(file);
          });
          toast.success(`${file.name} uploaded`);
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
    } finally {
      uploadLock.current = false;
      setUpload(null);
      if (picker.current) picker.current.value = "";
      await refresh();
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!modal || busy) return;
    setBusy(true);
    setFormError("");
    try {
      if (modal.type === "folder")
        await api("files", {
          method: "POST",
          body: JSON.stringify({
            name,
            parent: view === "files" ? parent : null,
          }),
        });
      if (modal.type === "rename")
        await api(`files/${modal.entry!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
      if (modal.type === "move")
        await api(`files/${modal.entry!.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            parent: destination === "root" ? null : destination,
          }),
        });
      setModal(null);
      toast.success(
        modal.type === "folder" ? "Folder created" : "Changes saved",
      );
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share(revoke = false) {
    if (!modal?.entry || busy) return;
    setBusy(true);
    setFormError("");
    try {
      const data = await api(`files/${modal.entry.id}/share`, {
        method: revoke ? "DELETE" : "POST",
      });
      setModal({
        type: "share",
        entry: {
          ...modal.entry,
          share_token: revoke ? null : data.token,
          share_expires: revoke ? null : data.expires,
        },
      });
      await refresh();
      toast.success(revoke ? "Link revoked" : "Link created");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shareUrl =
    modal?.entry?.share_token && typeof window !== "undefined"
      ? `${window.location.origin}/api/shares/${modal.entry.share_token}`
      : "";
  function openEntry(entry: Entry) {
    if (entry.kind === "folder") {
      setView("files");
      setParent(entry.id);
      setCategory("");
      setSearch("");
    } else window.location.assign(`/api/files/${entry.id}/download`);
  }
  function menu(entry: Entry) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="icon-button"
            aria-label={`Actions for ${entry.name}`}
          >
            <MoreHorizontal size={19} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {entry.trashed ? (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  void change(entry, { trashed: false }, "Item restored")
                }
              >
                <RotateCcw />
                Restore
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setRemove(entry)}
              >
                <Trash2 />
                Delete forever
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {entry.kind === "file" && (
                <DropdownMenuItem onSelect={() => openEntry(entry)}>
                  <Download />
                  Download
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() =>
                  void change(
                    entry,
                    { starred: !entry.starred },
                    entry.starred ? "Removed from starred" : "Added to starred",
                  )
                }
              >
                <Star />
                {entry.starred ? "Unstar" : "Add to starred"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openModal({ type: "rename", entry })}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openModal({ type: "move", entry })}
              >
                <FolderInput />
                Move to folder
              </DropdownMenuItem>
              {entry.kind === "file" && (
                <DropdownMenuItem
                  onSelect={() => openModal({ type: "share", entry })}
                >
                  <Link2 />
                  Share link
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  void change(entry, { trashed: true }, "Moved to trash")
                }
              >
                <Trash2 />
                Move to trash
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  const heading = search
    ? "Search results"
    : category
      ? categories.find((c) => c.id === category)?.name
      : parent
        ? entries.find((e) => e.id === parent)?.name
        : navigation.find((n) => n.id === view)?.label;
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "238px" } as React.CSSProperties}
    >
      <div className="shell flex w-full">
        <Sidebar>
          <SidebarHeader className="px-7 py-8">
            <a href="/" className="brand">
              <CloudIcon size={34} strokeWidth={1.7} />
              <span>
                koude<small>CLOUD</small>
              </span>
            </a>
          </SidebarHeader>
          <SidebarContent className="px-4">
            <p className="sidebar-label">Workspace</p>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    className="nav-button"
                    isActive={view === item.id}
                    onClick={() => navigate(item.id)}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                    {item.id === "files" && !loading && (
                      <span className="ml-auto text-xs opacity-60">
                        {activeFiles.length}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="px-5 pb-5">
            <div className="storage-box">
              <div className="flex items-center gap-2 text-sm">
                <HardDrive size={16} />
                Your storage
              </div>
              <Progress
                className="mt-4 h-1.5"
                value={(used / QUOTA) * 100}
                aria-label="Storage used"
              />
              <p>
                {formatBytes(used)} <span className="text-slate-600">of</span> 1
                GB used
              </p>
            </div>
            <div className="account">
              <div className="avatar">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <span>{user.name}</span>
                <small>Personal workspace</small>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>
        <main
          className={`workspace ${drag ? "drag-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setDrag(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void uploadFiles(e.dataTransfer.files);
          }}
        >
          <header className="topbar">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <SidebarTrigger className="md:hidden" />
              <label className="search">
                <Search size={19} />
                <input
                  aria-label="Search files"
                  placeholder="Search your files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Account menu" className="avatar">
                  {user.name.slice(0, 2).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-3 py-2 text-sm max-w-64 truncate">
                  {user.email}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    if (logoutPath.startsWith("/api/"))
                      void api("auth/logout", { method: "POST" })
                        .then(() => window.location.assign("/login"))
                        .catch((e) => toast.error(e.message));
                    else window.location.assign(logoutPath);
                  }}
                >
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <div className="content">
            <p className="eyebrow">Your personal cloud</p>
            <div className="page-heading">
              <div>
                <h1>{heading ?? "My files"}</h1>
                <p>
                  {view === "trash"
                    ? "Restore what you need. Let go of the rest."
                    : view === "shared"
                      ? "Keep control of the files you share."
                      : "Everything you need, right where you left it."}
                </p>
              </div>
              <div className="actions">
                <button
                  className="btn"
                  onClick={() => openModal({ type: "folder" })}
                >
                  <Plus size={17} />
                  New folder
                </button>
                <button
                  className="btn primary"
                  disabled={!!upload}
                  onClick={() => picker.current?.click()}
                >
                  <Upload size={17} />
                  {upload ? "Uploading…" : "Upload files"}
                </button>
              </div>
            </div>
            <input
              type="file"
              multiple
              hidden
              ref={picker}
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files);
              }}
            />
            {error && (
              <div className="error-banner" role="alert">
                {error}{" "}
                <button
                  className="underline ml-3"
                  onClick={() => void refresh()}
                >
                  Try again
                </button>
              </div>
            )}
            {view === "files" && !parent && !search && (
              <div className="overview">
                {categories.map((item) => {
                  const matches = activeFiles.filter(
                    (e) => fileCategory(e.mime) === item.id,
                  );
                  return (
                    <button
                      key={item.id}
                      className={`category ${category === item.id ? "active" : ""}`}
                      onClick={() =>
                        setCategory(category === item.id ? "" : item.id)
                      }
                      aria-pressed={category === item.id}
                    >
                      <div className="category-top">
                        <span className={`file-symbol ${item.id}`}>
                          <item.icon size={23} strokeWidth={1.5} />
                        </span>
                        <ArrowUpRight size={15} className="text-slate-500" />
                      </div>
                      <h2>{item.name}</h2>
                      <p>
                        {matches.length} files{" "}
                        <span className="mx-1 text-slate-600">·</span>{" "}
                        {formatBytes(
                          matches.reduce((s, e) => s + Number(e.size), 0),
                        )}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
            {parent && (
              <nav className="breadcrumb" aria-label="Folder path">
                <button onClick={() => setParent(null)}>My files</button>
                {trail.map((folder) => (
                  <span key={folder.id} className="flex items-center gap-2">
                    <ChevronRight size={14} />
                    <button onClick={() => setParent(folder.id)}>
                      {folder.name}
                    </button>
                  </span>
                ))}
              </nav>
            )}
            {category && (
              <button className="btn mb-4" onClick={() => setCategory("")}>
                <X size={14} />
                Clear file type
              </button>
            )}
            {folderItems.length > 0 && (
              <>
                <div className="section-heading">
                  <h2>Folders</h2>
                  <span>{folderItems.length} folders</span>
                </div>
                <div className="folder-grid">
                  {folderItems.map((folder) => (
                    <div key={folder.id} className="folder-card">
                      <button
                        disabled={!!folder.trashed}
                        onClick={() => openEntry(folder)}
                      >
                        <Folder size={30} strokeWidth={1.3} />
                        <div className="min-w-0">
                          <strong>{folder.name}</strong>
                          <small>
                            {
                              entries.filter(
                                (e) => e.parent === folder.id && !e.trashed,
                              ).length
                            }{" "}
                            items{folder.starred ? " · Starred" : ""}
                          </small>
                        </div>
                      </button>
                      {menu(folder)}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="section-heading">
              <div className="flex gap-3 items-center">
                <h2>{view === "recent" ? "Recently updated" : "Files"}</h2>
                <span>{fileItems.length}</span>
              </div>
              <div className="view-tools">
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger
                    className="h-8 border-0 bg-transparent shadow-none text-xs w-36"
                    aria-label="Sort files"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated">Last modified</SelectItem>
                    <SelectItem value="name">Name A–Z</SelectItem>
                    <SelectItem value="size">Largest first</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  className="icon-button"
                  aria-label="List view"
                  aria-pressed={!grid}
                  onClick={() => setGrid(false)}
                >
                  <List size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Grid view"
                  aria-pressed={grid}
                  onClick={() => setGrid(true)}
                >
                  <LayoutGrid size={17} />
                </button>
              </div>
            </div>
            {loading ? (
              <div aria-label="Loading files" role="status">
                {[1, 2, 3].map((i) => (
                  <div className="loading-row" key={i} />
                ))}
              </div>
            ) : fileItems.length === 0 ? (
              <div className="empty-state">
                <CloudIcon size={40} strokeWidth={1.2} />
                <h2>
                  {search
                    ? "No matching files"
                    : view === "trash"
                      ? "Nothing in the trash"
                      : view === "starred"
                        ? "Your favorites belong here"
                        : view === "shared"
                          ? "No shared links yet"
                          : "A little space for everything"}
                </h2>
                <p>
                  {search
                    ? "Try another name or clear your search."
                    : view === "starred"
                      ? "Star a file from its menu to find it here."
                      : view === "shared"
                        ? "Create a link from a file’s menu when you’re ready to share."
                        : view === "trash"
                          ? "Items you remove will appear here until you delete them forever."
                          : "Drop in your first file, or start with a folder. This space is yours."}
                </p>
                {view === "files" && !search && (
                  <button
                    className="btn primary mt-2"
                    disabled={!!upload}
                    onClick={() => picker.current?.click()}
                  >
                    <Plus size={16} />
                    Add your first file
                  </button>
                )}
              </div>
            ) : grid ? (
              <div className="file-grid">
                {fileItems.map((entry) => (
                  <article className="file-card" key={entry.id}>
                    <button
                      disabled={!!entry.trashed}
                      onClick={() => openEntry(entry)}
                    >
                      <Symbol entry={entry} />
                      <strong>{entry.name}</strong>
                      <p>
                        {formatBytes(entry.size)}
                        {entry.starred ? " · Starred" : ""}
                      </p>
                    </button>
                    <div className="flex justify-end">{menu(entry)}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="file-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hide-mobile">
                        Last modified
                      </TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="hide-mobile">Access</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fileItems.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <button
                            className="file-name"
                            disabled={!!entry.trashed}
                            onClick={() => openEntry(entry)}
                          >
                            <Symbol entry={entry} />
                            <span>{entry.name}</span>
                            {!!entry.starred && (
                              <Star size={12} className="text-amber-200" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="hide-mobile">
                          {new Date(entry.updated).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>{formatBytes(entry.size)}</TableCell>
                        <TableCell className="hide-mobile">
                          <span className="private-badge">
                            {entry.share_token &&
                            (entry.share_expires ?? 0) > Date.now() ? (
                              <>
                                <Link2 size={12} />
                                Link enabled
                              </>
                            ) : (
                              <>
                                <LockKeyhole size={12} />
                                Only you
                              </>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>{menu(entry)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {upload ? (
              <div className="dropzone" role="status">
                <LoaderCircle className="animate-spin" size={20} />
                <div className="w-full max-w-lg">
                  <p className="mb-2 truncate">
                    {upload.name} ·{" "}
                    {upload.percent === 100 ? "Saving…" : `${upload.percent}%`}
                  </p>
                  <Progress
                    value={upload.percent}
                    className="h-1"
                    aria-label="Upload progress"
                  />
                </div>
              </div>
            ) : (
              view !== "trash" && (
                <button
                  className="dropzone w-full"
                  onClick={() => picker.current?.click()}
                >
                  <Upload size={20} />
                  <span>
                    Drop files here, or{" "}
                    <span className="text-blue-200">browse files</span>
                    <span className="hide-mobile"> · Up to 20 MB per file</span>
                  </span>
                </button>
              )
            )}
          </div>
        </main>
        <Dialog
          open={!!modal}
          onOpenChange={(open) => {
            if (!open && !busy) setModal(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {modal?.type === "folder"
                  ? "New folder"
                  : modal?.type === "rename"
                    ? "Rename item"
                    : modal?.type === "move"
                      ? "Move to folder"
                      : "Share a file"}
              </DialogTitle>
              <DialogDescription>
                {modal?.type === "share"
                  ? "Anyone with this link can download the file for 7 days, subject to this site’s access settings."
                  : modal?.type === "move"
                    ? "Choose where this item belongs."
                    : "Keep your cloud organized, your way."}
              </DialogDescription>
            </DialogHeader>
            {modal?.type === "share" ? (
              <div>
                <p className="text-sm text-slate-300 truncate mb-4">
                  {modal.entry?.name}
                </p>
                {shareUrl && (modal.entry?.share_expires ?? 0) > Date.now() ? (
                  <>
                    <label className="input-label" htmlFor="share-link">
                      Download link
                    </label>
                    <input
                      id="share-link"
                      className="field"
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.target.select()}
                    />
                    <p className="text-xs text-slate-400 mt-2">
                      Expires{" "}
                      {new Date(
                        modal.entry!.share_expires!,
                      ).toLocaleDateString()}
                    </p>
                    <div className="flex gap-3 mt-5">
                      <button
                        className="btn primary"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(shareUrl)
                            .then(() => toast.success("Link copied"))
                            .catch(() =>
                              toast.error(
                                "Select the link and copy it manually",
                              ),
                            )
                        }
                      >
                        Copy link
                      </button>
                      <button
                        className="btn danger"
                        disabled={busy}
                        onClick={() => void share(true)}
                      >
                        Revoke link
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void share()}
                  >
                    {busy ? "Creating…" : "Create download link"}
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={submit}>
                {modal?.type === "move" ? (
                  <>
                    <label className="input-label">Destination</label>
                    <Select value={destination} onValueChange={setDestination}>
                      <SelectTrigger
                        className="w-full"
                        aria-label="Destination folder"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root">My files</SelectItem>
                        {folders
                          .filter((f) => f.id !== modal.entry?.id)
                          .map((f) => (
                            <SelectItem value={f.id} key={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <label htmlFor="item-name" className="input-label">
                      Name
                    </label>
                    <input
                      id="item-name"
                      className="field"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={180}
                      autoFocus
                    />
                  </>
                )}
                <button className="btn primary mt-6 w-full" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : modal?.type === "folder"
                      ? "Create folder"
                      : "Save changes"}
                </button>
              </form>
            )}
            {formError && (
              <p role="alert" className="text-sm text-red-300">
                {formError}
              </p>
            )}
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={!!remove}
          onOpenChange={(open) => {
            if (!open && !busy) setRemove(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this item forever?</AlertDialogTitle>
              <AlertDialogDescription>
                “{remove?.name}” will be permanently removed. You can’t undo
                this.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep item</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={async (e) => {
                  e.preventDefault();
                  if (!remove) return;
                  setBusy(true);
                  try {
                    await api(`files/${remove.id}`, { method: "DELETE" });
                    setRemove(null);
                    toast.success("Permanently deleted");
                    await refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Toaster theme="dark" position="bottom-right" />
      </div>
    </SidebarProvider>
  );
}
