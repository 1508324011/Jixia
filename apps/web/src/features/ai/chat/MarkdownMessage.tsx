import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  readonly content: string;
  readonly onCopyCode: (code: string) => void;
};

function createMarkdownComponents(onCopyCode: (code: string) => void): Components {
  return {
    a({ children, href }) {
      if (!href || !isSafeLink(href)) {
        return <>{children}</>;
      }

      return <a href={href} rel="noreferrer" target="_blank">{children}</a>;
    },
    h1({ children }) {
      return <h3>{children}</h3>;
    },
    h2({ children }) {
      return <h3>{children}</h3>;
    },
    h3({ children }) {
      return <h4>{children}</h4>;
    },
    h4({ children }) {
      return <h4>{children}</h4>;
    },
    code({ children, className, node }) {
      const match = /language-(\S+)/.exec(className ?? "");
      const language = match?.[1] ?? "text";
      const code = String(children).replace(/\n$/, "");
      const isInline = !className && node?.position?.start.line === node?.position?.end.line;

      if (isInline) {
        return <code>{children}</code>;
      }

      return (
        <figure className="jixia-chat-code-block">
          <figcaption>
            <span>{language}</span>
            <button onClick={() => onCopyCode(code)} type="button">Copy code</button>
          </figcaption>
          <pre><code className={className}>{children}</code></pre>
        </figure>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    table({ children }) {
      return (
        <div className="jixia-chat-table-wrap">
          <table>{children}</table>
        </div>
      );
    }
  };
}

export function MarkdownMessage({ content, onCopyCode }: MarkdownMessageProps) {
  return (
    <div className="jixia-chat-markdown">
      <ReactMarkdown components={createMarkdownComponents(onCopyCode)} remarkPlugins={[remarkGfm, remarkBreaks]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function isSafeLink(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:");
}
