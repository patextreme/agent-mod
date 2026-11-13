// Offline publication contract, not a GitHub client or a lifecycle authority.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const auditStart = "<!-- pr-review-repair-audit -->";
const auditEnd = "<!-- /pr-review-repair-audit -->";
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
const runOf = (marker) =>
  typeof marker === "string" &&
  /^<!-- pr-review-repair run=([a-f0-9]+) round=(?:[1-3] kind=(?:summary|escalation)|0 kind=escalation) -->$/.exec(
    marker,
  )?.[1];

function stableLink(url, pr) {
  return [pr, pr.replace("/pull/", "/issues/")].some(
    (base) =>
      typeof url === "string" &&
      url.startsWith(`${base}#issuecomment-`) &&
      /^\d+$/.test(url.slice(`${base}#issuecomment-`.length)),
  );
}

function readRecord(observation, pr, marker) {
  if (
    !observation ||
    !stableLink(observation.url, pr) ||
    typeof observation.body !== "string"
  )
    throw new Error("Audit record missing or unavailable");
  const body = observation.body;
  if (!body.startsWith(`${marker}\n`))
    throw new Error("Audit identity marker mismatch");
  const parts = body.split(auditStart);
  if (parts.length !== 2 || parts[1].split(auditEnd).length !== 2)
    throw new Error("Complete audit block missing or ambiguous");
  const block = parts[1].split(auditEnd)[0].trim();
  if (!block.startsWith("```json\n") || !block.endsWith("\n```"))
    throw new Error("Audit block is not complete JSON");
  const record = JSON.parse(block.slice(8, -4));
  if (record.pr !== pr || record.marker !== marker || !nonempty(record.head))
    throw new Error("Audit record identity mismatch");
  return record;
}

function acceptedApplicability(receipt, input, item, from, to) {
  const fields = ["item", "from", "to", "reason", "evidence"];
  return (
    receipt &&
    fields.every((field) => nonempty(receipt[field])) &&
    receipt.item === item &&
    receipt.from === from &&
    receipt.to === to &&
    (input.acceptedApplicability ?? []).some((candidate) =>
      fields.every((field) => candidate[field] === receipt[field]),
    )
  );
}

function resolveItem(entry, input, seen = new Set()) {
  if (!entry.ref) return entry;
  if (Object.hasOwn(entry, "content"))
    throw new Error("Item has both content and reference");
  const { url, marker, item } = entry.ref;
  const key = `${url}:${item}`;
  if (seen.has(key)) throw new Error("Cyclic audit reference");
  seen.add(key);
  const observations = input.sources.filter((source) => source.url === url);
  if (observations.length !== 1)
    throw new Error("Audit observation missing or ambiguous");
  const record = readRecord(observations[0], input.expected.pr, marker);
  if (runOf(record.marker) !== runOf(input.expected.marker))
    throw new Error("Referenced record belongs to another run");
  const entries = record.items.filter((candidate) => candidate.id === item);
  if (entries.length !== 1)
    throw new Error("Referenced item missing or ambiguous");
  const resolved = resolveItem(entries[0], input, seen);
  if (resolved.id !== entry.id || resolved.kind !== entry.kind)
    throw new Error("Referenced item identity mismatch");
  if (resolved.head !== entry.head) {
    if (
      !acceptedApplicability(
        entry.ref.applicability,
        input,
        entry.id,
        resolved.head,
        entry.head,
      )
    )
      throw new Error(
        "Referenced head changed without accepted applicability evidence",
      );
  }
  return { ...resolved, head: entry.head };
}

function evaluate(input) {
  const { expected, phase } = input;
  if (!["plan", "recover"].includes(phase))
    throw new Error("Phase must be plan or recover");
  if (
    !runOf(expected.marker) ||
    !/^https:\/\/[^/?#]+\/[^/?#]+\/[^/?#]+\/pull\/[1-9]\d*$/.test(expected.pr)
  )
    throw new Error("Expected PR or identity marker is invalid");
  const record =
    phase === "recover"
      ? readRecord(input.publication, expected.pr, expected.marker)
      : input.record;
  if (
    ![
      expected.items,
      record.items,
      expected.changedFindings,
      record.changedFindings,
      input.previousItems,
      input.sources,
    ].every(Array.isArray)
  )
    throw new Error(
      "Items, change notes, prior snapshot and source observations must be explicit arrays",
    );
  const gaps = [];
  for (const key of ["pr", "marker", "head"]) {
    if (!nonempty(expected[key]) || record[key] !== expected[key])
      gaps.push(`Record identity mismatch: ${key}`);
  }
  const kinds = new Set(expected.items.map((entry) => entry.kind));
  for (const kind of [
    "standards",
    "spec",
    "ledger",
    "checks",
    "accounting",
    "operation",
  ]) {
    if (!kinds.has(kind)) gaps.push(`Required audit category missing: ${kind}`);
  }
  if (
    record.items.length !== expected.items.length ||
    new Set(expected.items.map((entry) => entry.id)).size !==
      expected.items.length
  )
    gaps.push("Audit item inventory differs or has duplicate IDs");
  const previous = input.previousItems ?? [];
  for (const prior of previous) {
    const current = expected.items.find((entry) => entry.id === prior.id);
    if (!current) gaps.push(`Prior audit item omitted: ${prior.id}`);
    else if (current.kind !== prior.kind)
      gaps.push(`Prior item category changed: ${prior.id}`);
    else if (
      ["standards", "spec", "checks"].includes(prior.kind) &&
      (current.content !== prior.content || current.kind !== prior.kind)
    )
      gaps.push(`Original evidence rewritten: ${prior.id}`);
    if (
      current &&
      current.head !== prior.head &&
      ["standards", "spec", "checks"].includes(prior.kind)
    ) {
      const proposed = record.items.find((entry) => entry.id === prior.id);
      if (
        prior.kind !== "checks" ||
        !acceptedApplicability(
          proposed?.ref?.applicability,
          input,
          prior.id,
          prior.head,
          current.head,
        )
      )
        gaps.push(
          `Historical evidence head rewritten without accepted applicability: ${prior.id}`,
        );
    }
  }
  const changed = expected.items.filter(
    (entry) =>
      entry.kind === "finding" &&
      !previous.some(
        (prior) =>
          prior.id === entry.id &&
          prior.kind === entry.kind &&
          prior.content === entry.content &&
          prior.head === entry.head,
      ),
  );
  for (const finding of changed) {
    if (
      !expected.changedFindings.some(
        (change) => change.id === finding.id && nonempty(change.description),
      )
    )
      gaps.push(`Changed finding needs an explicit note: ${finding.id}`);
    if (record.items.find((entry) => entry.id === finding.id)?.ref)
      gaps.push(`Changed finding must be inline: ${finding.id}`);
  }
  if (
    JSON.stringify(record.changedFindings) !==
    JSON.stringify(expected.changedFindings)
  )
    gaps.push("Changed finding notes differ");
  for (const wanted of expected.items) {
    if (
      !nonempty(wanted.id) ||
      !nonempty(wanted.kind) ||
      !nonempty(wanted.head)
    )
      gaps.push("Invalid audit item identity");
    if (
      ["accounting", "operation"].includes(wanted.kind) &&
      wanted.head !== expected.head
    )
      gaps.push(`Current state head mismatch: ${wanted.id}`);
    const entries = record.items.filter((entry) => entry.id === wanted.id);
    if (entries.length !== 1) {
      gaps.push(`Missing or duplicate item: ${wanted.id}`);
      continue;
    }
    if (
      entries[0].ref &&
      (previous.length === 0 ||
        ["accounting", "operation"].includes(wanted.kind))
    )
      gaps.push(
        `First publication and current state require inline material: ${wanted.id}`,
      );
    try {
      const entry = resolveItem(entries[0], input);
      if (
        !nonempty(wanted.content) ||
        entry.content !== wanted.content ||
        entry.kind !== wanted.kind ||
        entry.head !== wanted.head
      ) {
        gaps.push(`Incomplete or changed audit item: ${wanted.id}`);
      }
    } catch (error) {
      gaps.push(`${wanted.id}: ${error.message}`);
    }
  }
  return {
    ok: gaps.length === 0,
    published: gaps.length === 0 && phase === "recover",
    gaps,
    audit: gaps.length
      ? null
      : `${auditStart}\n\`\`\`json\n${JSON.stringify(record, null, 2).replaceAll("<", "\\u003c")}\n\`\`\`\n${auditEnd}`,
    receipt:
      gaps.length === 0 && phase === "recover"
        ? {
            url: input.publication.url,
            marker: record.marker,
            head: record.head,
          }
        : null,
    recoveredItems:
      gaps.length === 0 && phase === "recover" ? expected.items : null,
  };
}

export function evaluatePublication(input) {
  try {
    return evaluate(input);
  } catch (error) {
    return {
      ok: false,
      published: false,
      gaps: [error.message],
      audit: null,
      receipt: null,
      recoveredItems: null,
    };
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let result;
  try {
    const input = JSON.parse(readFileSync(process.argv[3], "utf8"));
    result = evaluatePublication({ ...input, phase: process.argv[2] });
  } catch (error) {
    result = {
      ok: false,
      published: false,
      gaps: [error.message],
      receipt: null,
    };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
