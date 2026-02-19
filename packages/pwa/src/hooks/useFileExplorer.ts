import { useState, useCallback } from 'react';
import type { ClientMessage, FileListingEntry } from '@ccremote/shared';

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  children?: FileTreeNode[];
}

interface UseFileExplorerOptions {
  sessionId: string;
  projectPath: string;
  send: (message: ClientMessage) => void;
}

export function useFileExplorer({ sessionId, projectPath, send }: UseFileExplorerOptions) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [openFileContent, setOpenFileContent] = useState<string | null>(null);
  const [openFileError, setOpenFileError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  const requestListing = useCallback((path: string) => {
    send({ type: 'browse_files', payload: { sessionId, path } });
  }, [sessionId, send]);

  const handleFileListing = useCallback((path: string, entries: FileListingEntry[]) => {
    const normPath = path.replace(/\/+$/, '');
    const normProject = projectPath.replace(/\/+$/, '');

    const nodes: FileTreeNode[] = entries.map((e) => ({
      name: e.name,
      path: `${normPath}/${e.name}`,
      isDirectory: e.isDirectory,
      size: e.size,
    }));

    if (normPath === normProject) {
      setTree(nodes);
    } else {
      setTree((prev) => updateTreeChildren(prev, `${normPath}`, nodes));
    }
  }, [projectPath]);

  const toggleDirectory = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        requestListing(path);
      }
      return next;
    });
  }, [requestListing]);

  const openFile = useCallback((path: string) => {
    setOpenFilePath(path);
    setOpenFileContent(null);
    setOpenFileError(null);
    setIsLoadingFile(true);
    send({ type: 'read_file', payload: { sessionId, path } });
  }, [sessionId, send]);

  const handleFileContent = useCallback((path: string, content: string, error?: string) => {
    setOpenFileContent(error ? null : content);
    setOpenFileError(error ?? null);
    setIsLoadingFile(false);
  }, []);

  const saveFile = useCallback((path: string, content: string) => {
    send({ type: 'write_file', payload: { sessionId, path, content } });
  }, [sessionId, send]);

  const handleFileWriteResult = useCallback((path: string, success: boolean, error?: string) => {
    if (success && path === openFilePath) {
      // Update the "saved" content so hasChanges resets
      setOpenFileContent((prev) => prev);
    }
    if (error) {
      setOpenFileError(error);
    }
  }, [openFilePath]);

  const closeFile = useCallback(() => {
    setOpenFilePath(null);
    setOpenFileContent(null);
    setOpenFileError(null);
    setIsLoadingFile(false);
  }, []);

  const deleteFile = useCallback((path: string) => {
    send({ type: 'delete_file', payload: { sessionId, path } });
  }, [sessionId, send]);

  const handleFileDeleteResult = useCallback((path: string, success: boolean) => {
    if (success) {
      setTree((prev) => removeFromTree(prev, path));
      if (path === openFilePath) {
        setOpenFilePath(null);
        setOpenFileContent(null);
        setOpenFileError(null);
      }
    }
  }, [openFilePath]);

  const createFile = useCallback((path: string) => {
    send({ type: 'create_file', payload: { sessionId, path } });
  }, [sessionId, send]);

  const createDirectory = useCallback((path: string) => {
    send({ type: 'create_directory', payload: { sessionId, path } });
  }, [sessionId, send]);

  const renameFile = useCallback((oldPath: string, newPath: string) => {
    send({ type: 'rename_file', payload: { sessionId, oldPath, newPath } });
  }, [sessionId, send]);

  const handleFileCreateResult = useCallback((path: string, success: boolean, isDirectory: boolean, error?: string) => {
    if (success) {
      const name = path.split('/').pop() ?? '';
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      const newNode: FileTreeNode = { name, path, isDirectory, size: 0 };
      const normProject = projectPath.replace(/\/+$/, '');

      if (parentPath === normProject) {
        setTree((prev) => insertSorted(prev, newNode));
      } else {
        setTree((prev) => insertIntoTree(prev, parentPath, newNode));
      }

      if (!isDirectory) {
        openFile(path);
      }
    }
    if (error) {
      setOpenFileError(error);
    }
  }, [projectPath, openFile]);

  const handleFileRenameResult = useCallback((oldPath: string, newPath: string, success: boolean, error?: string) => {
    if (success) {
      const newName = newPath.split('/').pop() ?? '';
      setTree((prev) => renameInTree(prev, oldPath, newPath, newName));
      if (openFilePath === oldPath) {
        setOpenFilePath(newPath);
      }
    }
    if (error) {
      setOpenFileError(error);
    }
  }, [openFilePath]);

  return {
    tree, expandedPaths,
    openFilePath, openFileContent, openFileError, isLoadingFile,
    requestListing, handleFileListing,
    toggleDirectory, openFile, handleFileContent,
    saveFile, handleFileWriteResult, closeFile,
    deleteFile, handleFileDeleteResult,
    createFile, createDirectory, renameFile,
    handleFileCreateResult, handleFileRenameResult,
  };
}

function removeFromTree(tree: FileTreeNode[], path: string): FileTreeNode[] {
  return tree
    .filter((node) => node.path !== path)
    .map((node) => {
      if (node.children) {
        return { ...node, children: removeFromTree(node.children, path) };
      }
      return node;
    });
}

function updateTreeChildren(
  tree: FileTreeNode[],
  parentPath: string,
  children: FileTreeNode[]
): FileTreeNode[] {
  return tree.map((node) => {
    if (node.path === parentPath) {
      return { ...node, children };
    }
    if (node.children) {
      return { ...node, children: updateTreeChildren(node.children, parentPath, children) };
    }
    return node;
  });
}

function insertSorted(tree: FileTreeNode[], node: FileTreeNode): FileTreeNode[] {
  const result = [...tree];
  // Directories first, then alphabetical
  const insertIdx = result.findIndex((n) => {
    if (node.isDirectory && !n.isDirectory) return true;
    if (!node.isDirectory && n.isDirectory) return false;
    return n.name.localeCompare(node.name, undefined, { sensitivity: 'base' }) > 0;
  });
  if (insertIdx === -1) {
    result.push(node);
  } else {
    result.splice(insertIdx, 0, node);
  }
  return result;
}

function insertIntoTree(tree: FileTreeNode[], parentPath: string, node: FileTreeNode): FileTreeNode[] {
  return tree.map((n) => {
    if (n.path === parentPath) {
      return { ...n, children: insertSorted(n.children ?? [], node) };
    }
    if (n.children) {
      return { ...n, children: insertIntoTree(n.children, parentPath, node) };
    }
    return n;
  });
}

function renameInTree(tree: FileTreeNode[], oldPath: string, newPath: string, newName: string): FileTreeNode[] {
  return tree.map((node) => {
    if (node.path === oldPath) {
      return { ...node, path: newPath, name: newName };
    }
    if (node.children) {
      return { ...node, children: renameInTree(node.children, oldPath, newPath, newName) };
    }
    return node;
  });
}
