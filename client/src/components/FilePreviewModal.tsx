import { useEffect, useState, type CSSProperties } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

const API_URL = 'http://localhost:5174/api';

type PreviewResponse =
  | { kind: 'text'; content: string; language: string; name: string; ext: string; size: number }
  | { kind: 'markdown'; content: string; language: string; name: string; ext: string; size: number }
  | { kind: 'image'; mimeType: string; content: string; name: string; ext: string; size: number }
  | { kind: 'unsupported'; reason: 'binary' | 'too_large'; name: string; ext: string; size: number };

// Pixel-art palette borrowed from InteractionModal so previews feel like part
// of the same world. Modal is intentionally larger because Monaco needs room.
const COLORS = {
  ink: '#3A2E12',
  border: '#4A3B1A',
  gold: '#FFE040',
  cream: '#FFF8E6',
};

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.55)', fontFamily: 'monospace',
};

const modal: CSSProperties = {
  width: 'min(960px, 94vw)', height: 'min(720px, 88vh)',
  display: 'flex', flexDirection: 'column',
  background: COLORS.cream, color: COLORS.ink,
  border: `4px solid ${COLORS.border}`, boxShadow: '8px 8px 0 rgba(0,0,0,0.4)',
};

const titleBar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 12px', background: COLORS.gold,
  borderBottom: `4px solid ${COLORS.border}`, fontWeight: 700, gap: 12,
};

const titleText: CSSProperties = {
  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const closeBtn: CSSProperties = {
  cursor: 'pointer', fontWeight: 700, padding: '0 6px',
  background: 'transparent', border: 'none', color: COLORS.ink,
  fontFamily: 'monospace', fontSize: 16,
};

const body: CSSProperties = {
  flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex',
};

const toggleBtn = (active: boolean): CSSProperties => ({
  fontFamily: 'monospace', fontWeight: 700, fontSize: 12,
  padding: '4px 10px', cursor: 'pointer',
  color: COLORS.ink, background: active ? COLORS.gold : '#E8DFC2',
  border: `2px solid ${COLORS.border}`,
});

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function FilePreviewModal({
  projectId, filePath, onClose,
}: {
  projectId?: string;
  filePath: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markdownMode, setMarkdownMode] = useState<'preview' | 'source'>('preview');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const params = new URLSearchParams({ filePath });
    if (projectId) params.set('projectId', projectId);
    fetch(`${API_URL}/file/read?${params.toString()}`)
      .then(async r => {
        if (!r.ok) {
          const txt = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status}${txt ? ' — ' + txt : ''}`);
        }
        return r.json() as Promise<PreviewResponse>;
      })
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [projectId, filePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const titleRight = data
    ? `${humanSize(data.size)}`
    : error
      ? 'erreur'
      : 'chargement…';

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={titleBar}>
          <span style={titleText} title={filePath}>📄 {filePath}</span>
          {data?.kind === 'markdown' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={toggleBtn(markdownMode === 'preview')} onClick={() => setMarkdownMode('preview')}>Rendu</button>
              <button style={toggleBtn(markdownMode === 'source')} onClick={() => setMarkdownMode('source')}>Source</button>
            </div>
          )}
          <span style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap' }}>{titleRight}</span>
          <button style={closeBtn} onClick={onClose} title="Fermer (Échap)">✕</button>
        </div>

        <div style={body}>
          {error && (
            <div style={{ padding: 16, color: '#7A0E0E' }}>
              Impossible de charger le fichier.<br />
              <code style={{ fontSize: 12 }}>{error}</code>
            </div>
          )}
          {!error && !data && (
            <div style={{ padding: 16, opacity: 0.7 }}>Chargement…</div>
          )}
          {data?.kind === 'text' && <MonacoPane value={data.content} language={data.language} />}
          {data?.kind === 'markdown' && markdownMode === 'source' && (
            <MonacoPane value={data.content} language="markdown" />
          )}
          {data?.kind === 'markdown' && markdownMode === 'preview' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: '#fff' }}>
              <div className="cm-md">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {data.content}
                </ReactMarkdown>
              </div>
            </div>
          )}
          {data?.kind === 'image' && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#1a1a1a', overflow: 'auto', padding: 16,
            }}>
              <img
                src={`data:${data.mimeType};base64,${data.content}`}
                alt={data.name}
                style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
              />
            </div>
          )}
          {data?.kind === 'unsupported' && (
            <div style={{ padding: 24, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Aperçu non disponible</div>
              <div>Fichier : <code>{data.name}</code></div>
              <div>Extension : <code>{data.ext || '(aucune)'}</code></div>
              <div>Taille : {humanSize(data.size)}</div>
              <div style={{ marginTop: 8, opacity: 0.75 }}>
                {data.reason === 'too_large'
                  ? 'Le fichier dépasse la limite de prévisualisation.'
                  : 'Contenu binaire détecté — pas de rendu texte.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MonacoPane({ value, language }: { value: string; language: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      <Editor
        height="100%"
        defaultLanguage={language}
        language={language}
        value={value}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          renderLineHighlight: 'none',
        }}
      />
    </div>
  );
}
