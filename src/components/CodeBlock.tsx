import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border border-[#30363d] rounded-t-lg border-b-0">
          <span className="text-sm text-gray-400 font-mono">{filename}</span>
          <span className="text-xs text-gray-500 uppercase">{language}</span>
        </div>
      )}
      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 rounded-md bg-[#21262d] border border-[#30363d] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#30363d] z-10"
          title="Copy code"
        >
          {copied ? (
            <Check size={14} className="text-green-400" />
          ) : (
            <Copy size={14} className="text-gray-400" />
          )}
        </button>
        <pre
          className={`code-block p-4 overflow-x-auto ${filename ? 'rounded-t-none' : ''}`}
        >
          <code className="text-gray-300 whitespace-pre">{code}</code>
        </pre>
      </div>
    </div>
  );
}
