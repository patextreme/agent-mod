export type PermissionAction = "allow" | "ask" | "deny";

export interface PermissionRule {
  id: number;
  regex: RegExp;
  action: PermissionAction;
}

// Rules processed in forward order - first matching rule wins
export const PERMISSION_RULES: PermissionRule[] = [
  { id: 1, regex: /\bgit push/, action: "ask" },
  { id: 2, regex: /\bgit rebase/, action: "ask" },
  { id: 3, regex: /\bgh repo view/, action: "allow" },
  { id: 4, regex: /\bgh repo list/, action: "allow" },
  { id: 5, regex: /\bgh issue view/, action: "allow" },
  { id: 6, regex: /\bgh issue list/, action: "allow" },
  { id: 7, regex: /\bgh pr view/, action: "allow" },
  { id: 8, regex: /\bgh pr list/, action: "allow" },
  { id: 9, regex: /\bgh pr checks/, action: "allow" },
  { id: 10, regex: /\bgh pr diff/, action: "allow" },
  { id: 11, regex: /\bgh release view/, action: "allow" },
  { id: 12, regex: /\bgh release list/, action: "allow" },
  { id: 13, regex: /\bgh workflow view/, action: "allow" },
  { id: 14, regex: /\bgh workflow list/, action: "allow" },
  { id: 15, regex: /\bgh run view/, action: "allow" },
  { id: 16, regex: /\bgh run list/, action: "allow" },
  { id: 17, regex: /\bgh run watch/, action: "allow" },
  { id: 18, regex: /\bgh search/, action: "allow" },
  // gh api read-only: explicit GET method (--method GET, --method=GET, -X GET, -XGET)
  { id: 19, regex: /\bgh api\b.*(?:--method|-X)[\s=]*GET\b/, action: "allow" },
  // gh api read-only: implicit GET (no --method/-X AND no body-adding flags -f/-F/--raw-field/--field)
  // Note: gh api defaults to POST when -f/-F/--field/--raw-field are present
  // -X[A-Z] catches concatenated short-flag form like -XPOST
  {
    id: 20,
    regex:
      /\bgh api\b(?!.*(?:--method\b|-X\b|-X[A-Z]|-f\b|-F\b|--raw-field\b|--field\b))/,
    action: "allow",
  },
  { id: 21, regex: /\bgh /, action: "ask" },
];

export function findMatchingRule(command: string): PermissionRule | undefined {
  for (const rule of PERMISSION_RULES) {
    if (rule.regex.test(command)) return rule;
  }
  return undefined;
}
