import { useEffect, useState, useRef } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, FileText, Copy, ClipboardCopy, Trash2, Pencil, FilePlus, FolderPlus, Search, X, Download } from 'lucide-react';
import type { FileTreeNode } from '../hooks/useFileExplorer.ts';
import { getFileIconSvg, isTextFile, formatFileSize } from '../lib/fileUtils.ts';

interface FileExplorerProps {
  projectPath: string;
  projectName: string;
  tree: FileTreeNode[];
  expandedPaths: Set<string>;
  onToggleDirectory: (path: string) => void;
  onOpenFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onCreateFile: (path: string) => void;
  onCreateDirectory: (path: string) => void;
  onRenameFile: (oldPath: string, newPath: string) => void;
  onDownloadFile: (path: string) => void;
  onRequestListing: (path: string) => void;
}

interface ContextMenuState {
  node: FileTreeNode;
  x: number;
  y: number;
}

export function FileExplorer({
  projectPath,
  projectName,
  tree,
  expandedPaths,
  onToggleDirectory,
  onOpenFile,
  onDeleteFile,
  onCreateFile,
  onCreateDirectory,
  onRenameFile,
  onDownloadFile,
  onRequestListing,
}: FileExplorerProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileTreeNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [createMode, setCreateMode] = useState<'file' | 'directory' | null>(null);
  const [createParentPath, setCreateParentPath] = useState<string>('');
  const [createName, setCreateName] = useState('');
  const [renameNode, setRenameNode] = useState<FileTreeNode | null>(null);
  const [renameName, setRenameName] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tree.length === 0) {
      onRequestListing(projectPath);
    }
  }, [projectPath, tree.length, onRequestListing]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [contextMenu]);

  // Focus search input when shown
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  // Focus create input
  useEffect(() => {
    if (createMode) setTimeout(() => createInputRef.current?.focus(), 50);
  }, [createMode]);

  // Focus rename input
  useEffect(() => {
    if (renameNode) setTimeout(() => renameInputRef.current?.focus(), 50);
  }, [renameNode]);

  const normProject = projectPath.replace(/\/+$/, '');

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
    setContextMenu(null);
  };

  const handleCopyRelativePath = (path: string) => {
    const relative = path.startsWith(normProject + '/')
      ? path.slice(normProject.length + 1)
      : path;
    navigator.clipboard.writeText(relative).catch(() => {});
    setContextMenu(null);
  };

  const handleOpenFromMenu = (node: FileTreeNode) => {
    if (node.isDirectory) {
      onToggleDirectory(node.path);
    } else if (isTextFile(node.name)) {
      onOpenFile(node.path);
    }
    setContextMenu(null);
  };

  const handleDeleteRequest = (node: FileTreeNode) => {
    setContextMenu(null);
    setConfirmDelete(node);
  };

  const handleConfirmDelete = () => {
    if (confirmDelete) {
      onDeleteFile(confirmDelete.path);
      setConfirmDelete(null);
    }
  };

  const handleStartCreate = (type: 'file' | 'directory', parentPath?: string) => {
    setContextMenu(null);
    setCreateMode(type);
    setCreateParentPath(parentPath ?? normProject);
    setCreateName('');
  };

  const handleConfirmCreate = () => {
    if (!createName.trim() || !createMode) return;
    const fullPath = `${createParentPath}/${createName.trim()}`;
    if (createMode === 'file') {
      onCreateFile(fullPath);
    } else {
      onCreateDirectory(fullPath);
    }
    setCreateMode(null);
    setCreateName('');
  };

  const handleDownload = (node: FileTreeNode) => {
    onDownloadFile(node.path);
    setContextMenu(null);
  };

  const handleStartRename = (node: FileTreeNode) => {
    setContextMenu(null);
    setRenameNode(node);
    setRenameName(node.name);
  };

  const handleConfirmRename = () => {
    if (!renameNode || !renameName.trim() || renameName === renameNode.name) {
      setRenameNode(null);
      return;
    }
    const parentPath = renameNode.path.substring(0, renameNode.path.lastIndexOf('/'));
    const newPath = `${parentPath}/${renameName.trim()}`;
    onRenameFile(renameNode.path, newPath);
    setRenameNode(null);
  };

  // Filter tree by search query
  const filteredTree = searchQuery ? filterTree(tree, searchQuery.toLowerCase()) : tree;

  return (
    <div className="h-full flex flex-col bg-surface-dark text-slate-200 relative">
      {/* Header */}
      <div className="sticky top-0 z-10 px-3 py-2 bg-slate-800/90 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Explorador
            </span>
            <div className="text-sm font-medium text-slate-200 mt-0.5 truncate">
              {projectName}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleStartCreate('file')}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 rounded-md transition-colors"
              title="Nuevo archivo"
            >
              <FilePlus size={16} />
            </button>
            <button
              onClick={() => handleStartCreate('directory')}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 rounded-md transition-colors"
              title="Nueva carpeta"
            >
              <FolderPlus size={16} />
            </button>
            <button
              onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); }}
              className={`p-1.5 rounded-md transition-colors ${showSearch ? 'text-indigo-400 bg-slate-700/80' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'}`}
              title="Buscar"
            >
              <Search size={16} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="mt-2 flex items-center gap-1.5 bg-slate-700/60 rounded-lg px-2 py-1.5">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar archivos..."
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-200">
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredTree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            expandedPaths={expandedPaths}
            onToggleDirectory={onToggleDirectory}
            onContextMenu={setContextMenu}
            searchQuery={searchQuery.toLowerCase()}
          />
        ))}
        {tree.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Cargando...
          </div>
        )}
        {tree.length > 0 && filteredTree.length === 0 && searchQuery && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Sin resultados para &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          node={contextMenu.node}
          x={contextMenu.x}
          y={contextMenu.y}
          onOpen={() => handleOpenFromMenu(contextMenu.node)}
          onCopyPath={() => handleCopyPath(contextMenu.node.path)}
          onCopyRelativePath={() => handleCopyRelativePath(contextMenu.node.path)}
          onRename={() => handleStartRename(contextMenu.node)}
          onDownload={() => handleDownload(contextMenu.node)}
          onNewFile={() => handleStartCreate('file', contextMenu.node.isDirectory ? contextMenu.node.path : contextMenu.node.path.substring(0, contextMenu.node.path.lastIndexOf('/')))}
          onNewFolder={() => handleStartCreate('directory', contextMenu.node.isDirectory ? contextMenu.node.path : contextMenu.node.path.substring(0, contextMenu.node.path.lastIndexOf('/')))}
          onDelete={() => handleDeleteRequest(contextMenu.node)}
        />
      )}

      {/* Create file/directory dialog */}
      {createMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-slate-100 font-medium mb-3">
              {createMode === 'file' ? 'Nuevo archivo' : 'Nueva carpeta'}
            </h3>
            <input
              ref={createInputRef}
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmCreate(); if (e.key === 'Escape') setCreateMode(null); }}
              placeholder={createMode === 'file' ? 'nombre.ext' : 'nombre-carpeta'}
              className="w-full bg-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none border border-slate-600 focus:border-indigo-500 transition-colors"
            />
            <p className="text-slate-500 text-xs mt-2 truncate">
              en {createParentPath.startsWith(normProject + '/') ? createParentPath.slice(normProject.length + 1) : '/'}
            </p>
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setCreateMode(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmCreate}
                disabled={!createName.trim()}
                className="px-4 py-2 rounded-lg text-sm text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename dialog */}
      {renameNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-slate-100 font-medium mb-3">Renombrar</h3>
            <input
              ref={renameInputRef}
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(); if (e.key === 'Escape') setRenameNode(null); }}
              className="w-full bg-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none border border-slate-600 focus:border-indigo-500 transition-colors"
            />
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setRenameNode(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRename}
                disabled={!renameName.trim() || renameName === renameNode.name}
                className="px-4 py-2 rounded-lg text-sm text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Renombrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-slate-100 font-medium mb-2">Eliminar</h3>
            <p className="text-slate-300 text-sm mb-1">
              {confirmDelete.isDirectory ? '¿Eliminar carpeta y todo su contenido?' : '¿Eliminar este archivo?'}
            </p>
            <p className="text-slate-400 text-xs font-mono truncate mb-5">
              {confirmDelete.name}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg text-sm text-white bg-red-600 hover:bg-red-500 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Context Menu ===

interface ContextMenuProps {
  node: FileTreeNode;
  x: number;
  y: number;
  onOpen: () => void;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onRename: () => void;
  onDownload: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
}

function ContextMenu({ node, x, y, onOpen, onCopyPath, onCopyRelativePath, onRename, onDownload, onNewFile, onNewFolder, onDelete }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const canOpen = node.isDirectory || isTextFile(node.name);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let adjustedX = x;
    let adjustedY = y;
    if (rect.right > window.innerWidth) adjustedX = window.innerWidth - rect.width - 8;
    if (rect.bottom > window.innerHeight) adjustedY = window.innerHeight - rect.height - 8;
    if (adjustedX < 8) adjustedX = 8;
    if (adjustedY < 8) adjustedY = 8;
    setPos({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  const itemClass = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-slate-700/80 transition-colors';

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[200px] bg-slate-800 border border-slate-600/80 rounded-lg shadow-2xl overflow-hidden py-1"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {canOpen && (
        <button className={itemClass} onClick={onOpen}>
          <FileText size={15} className="text-slate-400" />
          <span className="text-slate-200">Abrir</span>
        </button>
      )}
      {!node.isDirectory && (
        <button className={itemClass} onClick={onDownload}>
          <Download size={15} className="text-slate-400" />
          <span className="text-slate-200">Descargar</span>
        </button>
      )}
      <button className={itemClass} onClick={onRename}>
        <Pencil size={15} className="text-slate-400" />
        <span className="text-slate-200">Renombrar</span>
      </button>
      <button className={itemClass} onClick={onCopyPath}>
        <Copy size={15} className="text-slate-400" />
        <span className="text-slate-200">Copiar ruta</span>
      </button>
      <button className={itemClass} onClick={onCopyRelativePath}>
        <ClipboardCopy size={15} className="text-slate-400" />
        <span className="text-slate-200">Copiar ruta relativa</span>
      </button>
      <div className="h-px bg-slate-700 my-1" />
      <button className={itemClass} onClick={onNewFile}>
        <FilePlus size={15} className="text-slate-400" />
        <span className="text-slate-200">Nuevo archivo</span>
      </button>
      <button className={itemClass} onClick={onNewFolder}>
        <FolderPlus size={15} className="text-slate-400" />
        <span className="text-slate-200">Nueva carpeta</span>
      </button>
      <div className="h-px bg-slate-700 my-1" />
      <button className={`${itemClass} hover:bg-red-900/40`} onClick={onDelete}>
        <Trash2 size={15} className="text-red-400" />
        <span className="text-red-400">Eliminar</span>
      </button>
    </div>
  );
}

// === File Tree Item ===

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggleDirectory: (path: string) => void;
  onContextMenu: (state: ContextMenuState) => void;
  searchQuery: string;
}

function FileTreeItem({
  node, depth, expandedPaths, onToggleDirectory, onContextMenu, searchQuery,
}: FileTreeItemProps) {
  const isExpanded = expandedPaths.has(node.path);
  const paddingLeft = 12 + depth * 16;

  const handleClick = () => {
    if (node.isDirectory) {
      onToggleDirectory(node.path);
    } else {
      // Single click on file opens context menu
      onContextMenu({ node, x: paddingLeft + 40, y: 0 });
    }
  };

  const handleContextMenu = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onContextMenu({ node, x: e.clientX || rect.left + 40, y: e.clientY || rect.top });
  };

  const fileIconSvg = !node.isDirectory ? getFileIconSvg(node.name) : '';
  const canOpen = !node.isDirectory && isTextFile(node.name);

  // When searching, auto-expand directories
  const shouldShowChildren = node.isDirectory && (isExpanded || !!searchQuery);

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-1.5 py-1 hover:bg-slate-800/60 transition-colors text-left group ${
          !node.isDirectory && !canOpen ? 'opacity-50' : ''
        }`}
        style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '12px' }}
      >
        {node.isDirectory ? (
          isExpanded
            ? <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
            : <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}

        {node.isDirectory ? (
          isExpanded
            ? <FolderOpen size={16} className="text-indigo-400 flex-shrink-0" />
            : <Folder size={16} className="text-indigo-400 flex-shrink-0" />
        ) : fileIconSvg ? (
          <span
            className="w-4 h-4 flex-shrink-0 file-icon-svg"
            dangerouslySetInnerHTML={{ __html: fileIconSvg }}
          />
        ) : (
          <span className="w-4 h-4 flex-shrink-0 bg-slate-600 rounded-sm" />
        )}

        <span className={`text-sm truncate ${node.isDirectory ? 'font-medium' : ''}`}>
          {node.name}
        </span>

        {!node.isDirectory && node.size > 0 && (
          <span className="ml-auto text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {formatFileSize(node.size)}
          </span>
        )}
      </button>

      {shouldShowChildren && node.children?.map((child) => (
        <FileTreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          expandedPaths={expandedPaths}
          onToggleDirectory={onToggleDirectory}
          onContextMenu={onContextMenu}
          searchQuery={searchQuery}
        />
      ))}
    </>
  );
}

// === Filter helpers ===

function filterTree(tree: FileTreeNode[], query: string): FileTreeNode[] {
  const result: FileTreeNode[] = [];
  for (const node of tree) {
    if (node.isDirectory) {
      const filteredChildren = node.children ? filterTree(node.children, query) : [];
      if (node.name.toLowerCase().includes(query) || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
      }
    } else {
      if (node.name.toLowerCase().includes(query)) {
        result.push(node);
      }
    }
  }
  return result;
}
