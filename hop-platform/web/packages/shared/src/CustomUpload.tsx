import { useRef, useState } from "react";
import { api } from "./api";
import {
  IconCamera,
  IconCheck,
  IconEye,
  IconFolder,
  IconId,
  IconInfoCircle,
  IconLoader2,
  IconUpload,
  IconUser,
  IconX,
} from "@tabler/icons-react";

export interface CustomUploadProps {
  endpoint: string;
  label: string;
  instruction?: string;
  required?: boolean;
  portrait?: boolean;
  uploaded?: boolean;
  previewDoc?: boolean;
  onTogglePreview?: () => void;
  onSaved: () => void | Promise<void>;
  notify: (msg: string) => void;
  className?: string;
}

async function processImage(file: File, portrait: boolean): Promise<string> {
  if (!/^image\/(jpeg|png)$/i.test(file.type) || file.size > 12 * 1024 * 1024) {
    throw new Error("Choose a JPEG or PNG image up to 12 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 64 || bitmap.height < 64) {
      throw new Error("Choose a clearer image at least 64 pixels wide and high.");
    }
    const canvas = document.createElement("canvas");
    const size = portrait ? Math.min(bitmap.width, bitmap.height) : 0;
    const scale = Math.min(1, (portrait ? 640 : 1600) / (portrait ? size : Math.max(bitmap.width, bitmap.height)));
    canvas.width = Math.round((portrait ? size : bitmap.width) * scale);
    canvas.height = Math.round((portrait ? size : bitmap.height) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is unavailable on this device.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      bitmap,
      portrait ? (bitmap.width - size) / 2 : 0,
      portrait ? (bitmap.height - size) / 2 : 0,
      portrait ? size : bitmap.width,
      portrait ? size : bitmap.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    bitmap.close();
  }
}

export default function CustomUpload({
  endpoint,
  label,
  instruction,
  required = true,
  portrait = false,
  uploaded = false,
  previewDoc = false,
  onTogglePreview,
  onSaved,
  notify,
  className = "",
}: CustomUploadProps) {
  const [busy, setBusy] = useState(false);
  const [previewData, setPreviewData] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const defaultInstruction = portrait
    ? "Upload a clear photo of yourself."
    : `Upload a valid ${label.toLowerCase()} image.`;

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const data = await processImage(file, portrait);
      setPreviewData(data);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  async function saveUpload() {
    if (!previewData) return;
    setBusy(true);
    try {
      await api(endpoint, { image: previewData });
      setPreviewData("");
      await onSaved();
      notify(`${label} uploaded privately.`);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`custom-upload-card ${className}`}>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        style={{ display: "none" }}
        disabled={busy}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="user"
        className="sr-only"
        style={{ display: "none" }}
        disabled={busy}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {/* Header with Title and Status Pill */}
      <div className="upload-header">
        <div className="upload-title-wrap">
          <h4 className="upload-title">
            {label}
            {required && <span className="upload-required-star" aria-hidden="true"> *</span>}
          </h4>
          <p className="upload-instruction">{instruction || defaultInstruction}</p>
        </div>
        <span className={`upload-status-badge ${uploaded ? "uploaded" : "required"}`}>
          {uploaded ? (
            <>
              <IconCheck size={12} stroke={3} />
              <span>Uploaded</span>
            </>
          ) : (
            <span>Required</span>
          )}
        </span>
      </div>

      {/* Pending preview before saving */}
      {previewData ? (
        <div className="upload-preview-box">
          <div className="upload-preview-thumb">
            <img
              src={`data:image/jpeg;base64,${previewData}`}
              alt={`${label} preview`}
              className={portrait ? "portrait-thumb" : "doc-thumb"}
            />
          </div>
          <div className="upload-preview-meta">
            <p className="upload-preview-status">Ready to upload</p>
            <div className="upload-preview-actions">
              <button
                type="button"
                className="button primary-btn"
                disabled={busy}
                onClick={() => void saveUpload()}
              >
                {busy ? (
                  <>
                    <IconLoader2 size={16} className="animate-spin" />
                    <span>Uploading…</span>
                  </>
                ) : (
                  <>
                    <IconUpload size={16} />
                    <span>Save {portrait ? "portrait" : "document"}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setPreviewData("")}
              >
                <IconX size={16} />
                <span>Discard</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Dashed upload container */
        <div
          className={`upload-dropzone ${isDragOver ? "drag-over" : ""} ${portrait ? "is-portrait" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            void handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          {portrait ? (
            <div className="upload-portrait-layout">
              {/* Tap to upload photo left side */}
              <div
                className="upload-click-zone"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <div className="upload-icon-circle">
                  <IconUser size={22} />
                </div>
                <div className="upload-text-block">
                  <strong className="upload-action-text">Tap to upload photo</strong>
                  <span className="upload-subtext">JPEG or PNG · Clear, front-facing photo</span>
                </div>
              </div>

              {/* OR Divider */}
              <div className="upload-divider" aria-hidden="true">
                <span>OR</span>
              </div>

              {/* Take photo right side */}
              <button
                type="button"
                className="take-photo-btn"
                onClick={() => cameraInputRef.current?.click()}
              >
                <IconCamera size={22} />
                <span>Take photo</span>
              </button>
            </div>
          ) : (
            <div className="upload-document-layout">
              {/* Choose file left side */}
              <div
                className="upload-click-zone"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <div className="upload-icon-circle">
                  <IconId size={22} />
                </div>
                <div className="upload-text-block">
                  <strong className="upload-action-text">Choose a file to upload</strong>
                  <span className="upload-subtext">JPEG or PNG · Clear and readable</span>
                </div>
              </div>

              {/* Browse file button */}
              <button
                type="button"
                className="browse-file-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconFolder size={16} />
                <span>Browse file</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Helper text below upload box */}
      {portrait && (
        <div className="upload-helper-note">
          <IconInfoCircle size={14} className="helper-icon" aria-hidden="true" />
          <span>A square centre crop will be applied before saving.</span>
        </div>
      )}

      {/* Uploaded actions: review document / replace */}
      {uploaded && !previewData && onTogglePreview && (
        <div className="upload-post-actions">
          <button
            type="button"
            className="text-button inline-flex items-center gap-1"
            onClick={onTogglePreview}
          >
            <IconEye size={14} />
            <span>{previewDoc ? "Hide document" : "Review document"}</span>
          </button>
          <button
            type="button"
            className="text-button inline-flex items-center gap-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <span>Replace file</span>
          </button>
        </div>
      )}
    </div>
  );
}
