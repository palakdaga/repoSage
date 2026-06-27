'use client';

import { useState } from 'react';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileNode[];
  summary?: string;
}

interface FileExplorerProps {
  fileSummaries: Record<string, string>;
}

export function FileExplorer({ fileSummaries }: FileExplorerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Build file tree from flat paths
  const tree = buildFileTree(fileSummaries);

  const toggleDir = (path: string) => {
    const next = new Set(expandedDirs);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpandedDirs(next);
  };

  const filteredEntries = searchQuery
    ? Object.entries(fileSummaries).filter(([path]) =>
        path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px', minHeight: '400px' }}>
      {/* File tree sidebar */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        padding: '12px',
        overflow: 'auto',
        maxHeight: '600px',
      }}>
        <input
          type="text"
          placeholder="🔍 Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: 'white',
            fontSize: '0.85rem',
            marginBottom: '12px',
            outline: 'none',
          }}
        />

        {searchQuery && filteredEntries ? (
          <div>
            {filteredEntries.map(([path]) => (
              <div
                key={path}
                onClick={() => setSelectedFile(path)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: selectedFile === path ? '#6c5ce7' : '#b2bec3',
                  background: selectedFile === path ? 'rgba(108, 92, 231, 0.15)' : 'transparent',
                }}
              >
                📄 {path}
              </div>
            ))}
          </div>
        ) : (
          <FileTreeNode
            nodes={tree}
            selectedFile={selectedFile}
            expandedDirs={expandedDirs}
            onSelectFile={setSelectedFile}
            onToggleDir={toggleDir}
            depth={0}
          />
        )}
      </div>

      {/* File content panel */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        padding: '20px',
        overflow: 'auto',
        maxHeight: '600px',
      }}>
        {selectedFile && fileSummaries[selectedFile] ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.2rem' }}>📄</span>
              <h3 style={{ color: 'white', fontSize: '1rem', fontWeight: 600, margin: 0 }}>{selectedFile}</h3>
            </div>
            <div style={{
              color: '#b2bec3',
              fontSize: '0.9rem',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
            }}>
              {fileSummaries[selectedFile]}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', paddingTop: '80px', color: '#636e72' }}>
            <span style={{ fontSize: '2.5rem' }}>📂</span>
            <p style={{ marginTop: '12px' }}>Select a file to view its analysis</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FileTreeNode({
  nodes, selectedFile, expandedDirs, onSelectFile, onToggleDir, depth,
}: {
  nodes: FileNode[];
  selectedFile: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  depth: number;
}) {
  return (
    <div>
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            onClick={() => node.isDirectory ? onToggleDir(node.path) : onSelectFile(node.path)}
            style={{
              padding: '4px 8px',
              paddingLeft: `${8 + depth * 16}px`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: selectedFile === node.path ? '#6c5ce7' : '#b2bec3',
              background: selectedFile === node.path ? 'rgba(108, 92, 231, 0.15)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {node.isDirectory ? (
              <span>{expandedDirs.has(node.path) ? '📂' : '📁'}</span>
            ) : (
              <span>📄</span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>
          </div>
          {node.isDirectory && expandedDirs.has(node.path) && (
            <FileTreeNode
              nodes={node.children}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onSelectFile={onSelectFile}
              onToggleDir={onToggleDir}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function buildFileTree(fileSummaries: Record<string, string>): FileNode[] {
  const root: FileNode[] = [];
  const dirs = new Map<string, FileNode>();

  const paths = Object.keys(fileSummaries).sort();

  for (const filePath of paths) {
    const parts = filePath.split(/[/\\]/);
    let currentChildren = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (isFile) {
        currentChildren.push({
          name: part,
          path: filePath,
          isDirectory: false,
          children: [],
          summary: fileSummaries[filePath],
        });
      } else {
        let dirNode = dirs.get(currentPath);
        if (!dirNode) {
          dirNode = {
            name: part,
            path: currentPath,
            isDirectory: true,
            children: [],
          };
          dirs.set(currentPath, dirNode);
          currentChildren.push(dirNode);
        }
        currentChildren = dirNode.children;
      }
    }
  }

  return root;
}
