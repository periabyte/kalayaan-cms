import {
	ChevronLeft,
	File,
	FileText,
	Image,
	Menu,
	Moon,
	Search,
	Settings as SettingsIcon,
	Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useCurrentUser, useSchema } from "../lib/hooks.js";
import { useTheme } from "../lib/theme.js";
import { CommandPalette } from "./CommandPalette.js";
import { cn } from "./ui.js";

export function Layout() {
	const { data: schema } = useSchema();
	const { data: user } = useCurrentUser();
	const { theme, toggle } = useTheme();
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const location = useLocation();

	// Global ⌘K / Ctrl-K to open the command palette.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setPaletteOpen(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Close the mobile drawer whenever the route changes.
	useEffect(() => setMobileOpen(false), [location.pathname]);

	const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
	// The desktop "collapsed" rail never applies inside the mobile drawer, which
	// always shows full-width with labels.
	const expanded = mobileOpen || !collapsed;

	const navItem = (to: string, icon: React.ReactNode, label: string) => (
		<NavLink
			to={to}
			title={label}
			className={({ isActive }) =>
				cn(
					"w-full flex items-center rounded-lg cursor-pointer text-[13.5px]",
					expanded ? "gap-2.5 px-2.5 py-2" : "justify-center py-2.5",
					isActive
						? "bg-accent text-foreground font-semibold shadow-[inset_2px_0_0_hsl(var(--brand))]"
						: "text-muted-foreground font-medium hover:bg-accent",
				)
			}
		>
			<span className="flex-shrink-0 w-[15px] flex">{icon}</span>
			{expanded && <span className="flex-1 truncate text-left">{label}</span>}
		</NavLink>
	);

	return (
		<div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
			{/* mobile drawer backdrop */}
			{mobileOpen && (
				<div
					className="fixed inset-0 z-30 bg-black/40 md:hidden"
					onClick={() => setMobileOpen(false)}
				/>
			)}

			<aside
				className={cn(
					"fixed inset-y-0 left-0 z-40 md:static md:z-auto h-full flex-shrink-0 flex flex-col bg-card border-r border-border",
					"transition-transform duration-200 md:transition-[width]",
					"w-[264px]",
					collapsed ? "md:w-[68px]" : "md:w-[264px]",
					mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
				)}
			>
				{/* brand header */}
				<div className="h-14 flex-shrink-0 flex items-center gap-2.5 px-3.5 border-b border-border relative">
					<div className="w-7 h-7 flex-shrink-0 rounded-lg bg-brand flex items-center justify-center text-brand-foreground font-display font-bold text-[15px] shadow-token">
						{(schema?.name ?? "K").slice(0, 1).toUpperCase()}
					</div>
					{expanded && (
						<div className="flex flex-col leading-tight flex-1 overflow-hidden">
							<span className="font-semibold text-sm truncate">
								{schema?.name ?? "Kalayaan"}
							</span>
							<span className="text-[11px] text-muted-foreground">
								Content workspace
							</span>
						</div>
					)}
					<button
						onClick={() => setCollapsed((c) => !c)}
						title={collapsed ? "Expand" : "Collapse"}
						className={cn(
							"w-[26px] h-[26px] flex-shrink-0 rounded-[7px] border border-border bg-card text-muted-foreground hidden md:flex items-center justify-center hover:bg-accent hover:text-foreground",
							collapsed
								? "absolute -right-[13px] top-[15px] z-[5] shadow-token"
								: "ml-auto",
						)}
					>
						<ChevronLeft
							size={15}
							className={cn("transition-transform", collapsed && "rotate-180")}
						/>
					</button>
				</div>

				{/* search */}
				<button
					onClick={() => setPaletteOpen(true)}
					title="Search (⌘K)"
					className={cn(
						"flex items-center bg-muted text-muted-foreground border border-border rounded-lg hover:bg-accent-hover hover:text-foreground",
						expanded
							? "mx-3 mt-3 mb-1 h-[34px] gap-2 px-2.5"
							: "mx-auto mt-3 mb-1 w-10 h-10 justify-center",
					)}
				>
					<Search size={14} className="flex-shrink-0" />
					{expanded && (
						<>
							<span className="text-[13px]">Search or jump to…</span>
							<kbd className="ml-auto font-mono text-[11px] bg-card border border-border rounded px-1.5 text-muted-foreground">
								⌘K
							</kbd>
						</>
					)}
				</button>

				{/* nav */}
				<nav className="flex-1 overflow-y-auto p-2 pb-4 space-y-0.5">
					{expanded && (
						<div className="px-2 pt-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle-foreground">
							Collections
						</div>
					)}
					{schema?.collections.map((c) =>
						navItem(`/${c.name}`, c.singleton ? <File size={15} /> : <FileText size={15} />, c.name),
					)}
					{expanded && (
						<div className="px-2 pt-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle-foreground">
							Library
						</div>
					)}
					{!expanded && <div className="h-px mx-3.5 my-3 bg-border" />}
					{navItem("/media", <Image size={15} />, "Media")}
					{navItem("/settings", <SettingsIcon size={15} />, "Settings")}
				</nav>

				{/* footer */}
				<div
					className={cn(
						"border-t border-border flex items-center gap-2.5",
						expanded ? "px-3 py-2.5" : "flex-col py-2.5",
					)}
				>
					<div className="w-[30px] h-[30px] flex-shrink-0 rounded-full bg-mt-subtle text-mt-fg flex items-center justify-center font-semibold text-[12px]">
						{initials}
					</div>
					{expanded && (
						<div className="flex-1 leading-tight overflow-hidden">
							<div className="text-[13px] font-medium truncate">
								{user?.email ?? "—"}
							</div>
							<div className="text-[11px] text-muted-foreground capitalize">
								{user?.role ?? ""}
							</div>
						</div>
					)}
					<button
						onClick={toggle}
						title="Toggle theme"
						className="w-[30px] h-[30px] flex-shrink-0 rounded-lg border border-border bg-card text-muted-foreground flex items-center justify-center hover:bg-accent hover:text-foreground"
					>
						{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
					</button>
				</div>
			</aside>

			<div className="flex-1 min-w-0 h-full flex flex-col relative">
				{/* mobile top bar — always gives access to the nav drawer */}
				<div className="md:hidden h-12 flex-shrink-0 flex items-center gap-2.5 px-3 border-b border-border bg-card">
					<button
						onClick={() => setMobileOpen(true)}
						title="Menu"
						className="w-9 h-9 flex-shrink-0 rounded-lg border border-border bg-card text-muted-foreground flex items-center justify-center hover:bg-accent hover:text-foreground"
					>
						<Menu size={18} />
					</button>
					<div className="w-6 h-6 flex-shrink-0 rounded-md bg-brand flex items-center justify-center text-brand-foreground font-display font-bold text-[13px]">
						{(schema?.name ?? "K").slice(0, 1).toUpperCase()}
					</div>
					<span className="font-semibold text-sm truncate">
						{schema?.name ?? "Kalayaan"}
					</span>
					<button
						onClick={() => setPaletteOpen(true)}
						title="Search"
						className="ml-auto w-9 h-9 flex-shrink-0 rounded-lg border border-border bg-card text-muted-foreground flex items-center justify-center hover:bg-accent hover:text-foreground"
					>
						<Search size={16} />
					</button>
				</div>

				{/* key by pathname so views fully remount on navigation */}
				<Outlet key={location.pathname} />
			</div>

			<CommandPalette
				open={paletteOpen}
				onClose={() => setPaletteOpen(false)}
			/>
		</div>
	);
}
