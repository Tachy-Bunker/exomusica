export interface ParsedSearch {
  text: string;
  fromUsername?: string;
  hasFilters: ("sound" | "image" | "video" | "link")[];
}

const VALID_HAS = new Set(["sound", "image", "video", "link"]);

export function parseSearchQuery(raw: string): ParsedSearch {
  let text = raw;
  let fromUsername: string | undefined;
  const hasFilters: ParsedSearch["hasFilters"] = [];

  text = text.replace(/from:(\S+)/gi, (_, u: string) => {
    fromUsername = u;
    return "";
  });
  text = text.replace(/has:(\w+)/gi, (_, h: string) => {
    const lower = h.toLowerCase();
    if (VALID_HAS.has(lower)) hasFilters.push(lower as ParsedSearch["hasFilters"][number]);
    return "";
  });

  return { text: text.trim(), fromUsername, hasFilters };
}
