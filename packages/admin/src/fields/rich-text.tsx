import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../components/ui.js";
import { MediaPicker } from "../components/MediaPicker.js";
import type { FieldEditorProps } from "./registry.js";

/** Rich text is stored as portable TipTap JSON (see the runtime's toStored). */
export function RichTextField({ value, onChange }: FieldEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ HTMLAttributes: { class: "rte-image" } }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({ placeholder: "Write something, or press the toolbar to format…" }),
    ],
    content: (value as object) ?? "",
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
    editorProps: {
      attributes: { class: "rte-content min-h-[220px] px-[18px] py-4 text-[15px] leading-[1.75] text-foreground outline-none" },
    },
  });

  // The document loads asynchronously after this component mounts, so the
  // initial `content` above is usually empty. Sync it in when `value` arrives
  // (or changes externally, e.g. AI assist). The JSON equality guard means a
  // user's own edits — which flow out via onUpdate and back in as `value` —
  // never trigger a setContent, so the cursor doesn't jump while typing.
  useEffect(() => {
    if (!editor) return;
    const incoming = (value as object | undefined) ?? { type: "doc", content: [] };
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(incoming)) {
      editor.commands.setContent(incoming as never, false);
    }
  }, [editor, value]);

  if (!editor) return <div className="border border-input rounded-lg bg-card min-h-[264px]" />;

  const setLink = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Link URL", prev);
    if (url === null) return; // cancelled
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="border border-input rounded-lg overflow-hidden bg-card">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-card-2 flex-wrap">
        {/* headings */}
        <TB title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={14} />
        </TB>
        <TB title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={14} />
        </TB>
        <TB title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={14} />
        </TB>
        <Divider />

        {/* inline marks */}
        <TB title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </TB>
        <TB title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} />
        </TB>
        <TB title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={14} />
        </TB>
        <TB title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={14} />
        </TB>
        <TB title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code size={14} />
        </TB>
        <TB title="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
          <Highlighter size={14} />
        </TB>
        <TB title="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon size={14} />
        </TB>
        <TB title="Remove link" disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().unsetLink().run()}>
          <Unlink size={14} />
        </TB>
        <Divider />

        {/* lists */}
        <TB title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={14} />
        </TB>
        <TB title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={14} />
        </TB>
        <TB title="Task list" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListChecks size={14} />
        </TB>
        <Divider />

        {/* blocks */}
        <TB title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={14} />
        </TB>
        <TB title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <SquareCode size={14} />
        </TB>
        <TB title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={14} />
        </TB>
        <TB title="Insert image from media" onClick={() => setPickerOpen(true)}>
          <ImagePlus size={14} />
        </TB>
        <Divider />

        {/* alignment */}
        <TB title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft size={14} />
        </TB>
        <TB title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter size={14} />
        </TB>
        <TB title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight size={14} />
        </TB>
        <Divider />

        {/* history */}
        <TB title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={14} />
        </TB>
        <TB title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={14} />
        </TB>
      </div>
      <EditorContent editor={editor as Editor} />
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Insert image"
        accept={["image"]}
        onPick={(m) =>
          editor
            .chain()
            .focus()
            .setImage({ src: `/media/${m.id}`, alt: m.alt ?? m.filename })
            .run()
        }
      />
    </div>
  );
}

function TB({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean | undefined;
  disabled?: boolean | undefined;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-4 bg-border mx-1" />;
}
