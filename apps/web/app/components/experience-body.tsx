import type { BodyBlock } from "../../lib/experiences";

export function ExperienceBody({ blocks }: { blocks: BodyBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="experience-body">
      {blocks.map((block, index) => {
        const content = <InlineText inlines={block.inlines} />;
        if (block.type === "heading") return <h2 key={index}>{content}</h2>;
        if (block.type === "bullet") return <p key={index}>• {content}</p>;
        return <p key={index}>{content}</p>;
      })}
    </div>
  );
}

function InlineText({ inlines }: { inlines: BodyBlock["inlines"] }) {
  return (
    <>
      {inlines.map((item, index) => {
        if (item.kind === "bold") return <strong key={index}>{item.text}</strong>;
        if (item.kind === "italic") return <em key={index}>{item.text}</em>;
        if (item.kind === "link") {
          return (
            <a key={index} href={item.href} target="_blank" rel="noreferrer">
              {item.text}
            </a>
          );
        }
        return <span key={index}>{item.text}</span>;
      })}
    </>
  );
}
