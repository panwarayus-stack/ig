import { FileText, Folder, FolderOpen } from 'lucide-react';
import { useState } from 'react';

interface TreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  highlight?: boolean;
}

const projectTree: TreeNode = {
  name: 'ig-bot/',
  type: 'folder',
  children: [
    {
      name: 'src/',
      type: 'folder',
      children: [
        { name: 'index.js', type: 'file', highlight: true },
        { name: 'instagram.js', type: 'file', highlight: true },
        { name: 'handler.js', type: 'file', highlight: true },
        {
          name: 'commands/',
          type: 'folder',
          children: [
            { name: 'index.js', type: 'file', highlight: true },
            { name: 'help.js', type: 'file', highlight: true },
            { name: 'ping.js', type: 'file', highlight: true },
            { name: 'uptime.js', type: 'file', highlight: true },
            { name: 'info.js', type: 'file', highlight: true },
          ],
        },
        {
          name: 'lib/',
          type: 'folder',
          children: [
            { name: 'logger.js', type: 'file', highlight: true },
            { name: 'utils.js', type: 'file', highlight: true },
          ],
        },
      ],
    },
    {
      name: 'tests/',
      type: 'folder',
      children: [
        { name: 'handler.test.js', type: 'file', highlight: true },
      ],
    },
    {
      name: 'data/',
      type: 'folder',
      children: [
        { name: '.gitkeep', type: 'file' },
      ],
    },
    { name: '.env', type: 'file' },
    { name: '.env.example', type: 'file', highlight: true },
    { name: '.gitignore', type: 'file', highlight: true },
    { name: 'package.json', type: 'file', highlight: true },
  ],
};

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = node.type === 'folder';

  return (
    <div>
      <button
        onClick={() => isFolder && setExpanded(!expanded)}
        className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-[#1e2a4a] transition-colors w-full text-left ${
          node.highlight ? 'text-purple-300' : 'text-gray-400'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isFolder ? (
          expanded ? (
            <FolderOpen size={14} className="text-yellow-500 shrink-0" />
          ) : (
            <Folder size={14} className="text-yellow-600 shrink-0" />
          )
        ) : (
          <FileText size={14} className="text-blue-400 shrink-0" />
        )}
        <span className="text-sm font-mono">{node.name}</span>
      </button>
      {isFolder && expanded && node.children && (
        <div className="file-tree-line ml-4">
          {node.children.map((child, i) => (
            <TreeItem key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
        Project Structure
      </h3>
      <TreeItem node={projectTree} />
    </div>
  );
}
