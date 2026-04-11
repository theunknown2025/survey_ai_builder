import type { Edge, Logigramme, Node } from '../types/survey';

/**
 * Detects "pick your survey language" questions the model often adds; these are
 * undesirable when language is handled by the platform or translation flow.
 */
export function isLanguagePreferenceQuestionNode(node: Pick<Node, 'type' | 'label'>): boolean {
  if (node.type !== 'question') return false;
  const raw = node.label.trim();
  if (!raw) return false;
  const t = raw.toLowerCase();

  if (
    /preferred language.*survey|language for filling out|select your preferred language|choose your preferred language|which language (do you|would you) (prefer|like|want)/i.test(
      raw
    )
  ) {
    return true;
  }

  if (
    (/preferred language|language preference/.test(t) && /survey|questionnaire|filling|form/.test(t)) ||
    (/what language|which language/.test(t) && /survey|questionnaire|complete|fill/.test(t))
  ) {
    return true;
  }

  return false;
}

/**
 * Removes language-picker questions and reconnects the graph (incoming → outgoing).
 */
export function stripLanguagePickerQuestionsFromLogigramme(logigramme: Logigramme): Logigramme {
  const badIds = new Set(
    logigramme.nodes.filter((n) => isLanguagePreferenceQuestionNode(n)).map((n) => n.id)
  );
  if (badIds.size === 0) return logigramme;

  const edges = logigramme.edges || [];
  const bridgeEdges: Edge[] = [];
  let bridgeIdx = 0;

  for (const badId of badIds) {
    const incoming = edges.filter((e) => e.to === badId);
    const outgoing = edges.filter((e) => e.from === badId);
    for (const inc of incoming) {
      for (const out of outgoing) {
        bridgeIdx += 1;
        bridgeEdges.push({
          id: `e_lang_strip_${bridgeIdx}_${inc.from}_${out.to}`,
          from: inc.from,
          to: out.to,
          label: out.label || inc.label || '',
        });
      }
    }
  }

  const newNodes = logigramme.nodes.filter((n) => !badIds.has(n.id));
  const keptEdges = edges.filter((e) => !badIds.has(e.from) && !badIds.has(e.to));
  const merged = [...keptEdges, ...bridgeEdges];
  const seen = new Set<string>();
  const newEdges = merged.filter((e) => {
    const key = `${e.from}|${e.to}|${e.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let sections = logigramme.sections;
  if (sections?.length) {
    sections = sections.map((s) => ({
      ...s,
      questionIds: s.questionIds.filter((id) => !badIds.has(id)),
    }));
  }

  return { ...logigramme, nodes: newNodes, edges: newEdges, sections };
}
