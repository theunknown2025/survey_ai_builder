import { Node, Edge, Section, Logigramme } from '../types/survey';

const NODE_MIN_WIDTH = 200;
const NODE_MAX_WIDTH = 350;
const NODE_MIN_HEIGHT = 100;
const CIRCLE_DIAMETER = 100;
const HORIZONTAL_NODE_SPACING = 80; // Generous spacing between nodes horizontally
const VERTICAL_LEVEL_SPACING = 120; // Spacing between levels vertically
const SECTION_PADDING = 50; // Generous padding around sections
const SECTION_SPACING = 60; // Spacing between sections
const MIN_CONTAINER_WIDTH = 1400; // Minimum container width for better layout

interface NodeDimensions {
  width: number;
  height: number;
}

/**
 * Calculate node dimensions based on content
 */
function getNodeDimensions(node: Node): NodeDimensions {
  if (node.type === 'start' || node.type === 'end') {
    return { width: CIRCLE_DIAMETER, height: CIRCLE_DIAMETER };
  }
  
  // If node already has width/height, use them (but validate they're reasonable)
  if (node.width && node.height && node.width >= NODE_MIN_WIDTH && node.height >= NODE_MIN_HEIGHT) {
    return { 
      width: Math.min(node.width, NODE_MAX_WIDTH), 
      height: node.height 
    };
  }
  
  // Otherwise calculate based on content
  const labelLength = node.label?.length || 0;
  const optionsCount = node.options?.length || 0;
  
  // Calculate width based on content
  let calculatedWidth = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, labelLength * 8 + 32));
  
  if (optionsCount > 0) {
    const maxOptionLength = Math.max(...(node.options?.map(opt => opt.length) || [0]));
    calculatedWidth = Math.max(calculatedWidth, Math.min(NODE_MAX_WIDTH, maxOptionLength * 7 + 32));
  }
  
  // Calculate height based on content
  const baseHeight = NODE_MIN_HEIGHT;
  const labelLines = Math.ceil(labelLength / 40);
  const optionsHeight = optionsCount > 0 ? (Math.min(optionsCount, 3) * 20) + 20 : 0;
  const calculatedHeight = Math.max(baseHeight, baseHeight + (labelLines - 1) * 20 + optionsHeight);
  
  return { width: calculatedWidth, height: calculatedHeight };
}

/**
 * Arrange nodes in a hierarchical flow layout with modern spacing and visual hierarchy
 */
function arrangeNodes(nodes: Node[], edges: Edge[]): Node[] {
  // Ensure all nodes have proper dimensions before arranging
  const arrangedNodes = nodes.map(node => {
    if (node.type === 'question') {
      const dims = getNodeDimensions(node);
      return {
        ...node,
        width: dims.width,
        height: dims.height,
      };
    }
    return node;
  });
  
  const startNode = arrangedNodes.find(n => n.type === 'start');
  const endNode = arrangedNodes.find(n => n.type === 'end');
  const questionNodes = arrangedNodes.filter(n => n.type === 'question');
  
  if (!startNode || !endNode) {
    return arrangedNodes;
  }
  
  if (questionNodes.length === 0) {
    // Just position start and end nodes
    const startDims = getNodeDimensions(startNode);
    startNode.x = MIN_CONTAINER_WIDTH / 2 - startDims.width / 2;
    startNode.y = 80;
    const endDims = getNodeDimensions(endNode);
    endNode.x = MIN_CONTAINER_WIDTH / 2 - endDims.width / 2;
    endNode.y = 250;
    return arrangedNodes;
  }

  // Build a graph to understand the flow
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  
  questionNodes.forEach(node => {
    graph.set(node.id, []);
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  });

  edges.forEach(edge => {
    // Only process edges between question nodes
    if (edge.from !== startNode.id && edge.to !== endNode.id && 
        questionNodes.some(n => n.id === edge.from) && 
        questionNodes.some(n => n.id === edge.to)) {
      const from = graph.get(edge.from);
      if (from) {
        from.push(edge.to);
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
      }
    }
  });

  // Topological sort to determine levels with better branching detection
  const levels: string[][] = [];
  const queue: string[] = [];
  
  // Find nodes with no incoming edges (from start or orphaned nodes)
  const startEdges = edges.filter(e => e.from === startNode.id);
  startEdges.forEach(edge => {
    const targetId = edge.to;
    if (questionNodes.some(n => n.id === targetId)) {
      if (!inDegree.has(targetId) || inDegree.get(targetId) === 0) {
        queue.push(targetId);
      }
    }
  });
  
  // Also add any orphaned question nodes (no incoming edges at all)
  questionNodes.forEach(node => {
    if (!inDegree.has(node.id) || inDegree.get(node.id) === 0) {
      if (!queue.includes(node.id) && !startEdges.some(e => e.to === node.id)) {
        queue.push(node.id);
      }
    }
  });

  let currentLevel = 0;
  const visited = new Set<string>();
  const inDegreeCopy = new Map(inDegree);

  while (queue.length > 0 || currentLevel === 0) {
    const levelSize = queue.length;
    if (levelSize === 0 && currentLevel > 0) break;
    
    levels[currentLevel] = [];
    
    // Process all nodes at this level
    const currentLevelNodes: string[] = [];
    for (let i = 0; i < levelSize; i++) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      
      visited.add(nodeId);
      currentLevelNodes.push(nodeId);
      
      const neighbors = graph.get(nodeId) || [];
      neighbors.forEach(neighborId => {
        const currentInDegree = inDegreeCopy.get(neighborId) || 0;
        inDegreeCopy.set(neighborId, currentInDegree - 1);
        
        if (currentInDegree - 1 === 0 && !visited.has(neighborId)) {
          queue.push(neighborId);
        }
      });
    }
    
    levels[currentLevel] = currentLevelNodes;
    currentLevel++;
  }

  // Handle any remaining unvisited nodes (cycles or disconnected)
  questionNodes.forEach(node => {
    if (!visited.has(node.id)) {
      if (levels.length === 0) {
        levels[0] = [];
      }
      levels[levels.length - 1].push(node.id);
    }
  });

  // Calculate positions with modern spacing and visual hierarchy
  const startDims = getNodeDimensions(startNode);
  const startY = 80;
  let currentY = startY + startDims.height + VERTICAL_LEVEL_SPACING;
  const nodePositions = new Map<string, { x: number; y: number }>();
  
  // Calculate total width needed for each level and find maximum
  let maxLevelWidth = 0;
  const levelWidths: number[] = [];
  
  levels.forEach((levelNodes) => {
    if (levelNodes.length === 0) {
      levelWidths.push(0);
      return;
    }
    
    // Calculate total width needed for this level
    let totalWidth = 0;
    
    levelNodes.forEach(nodeId => {
      const node = arrangedNodes.find(n => n.id === nodeId);
      if (node) {
        const dims = getNodeDimensions(node);
        totalWidth += dims.width;
      }
    });
    
    // Add spacing between nodes
    const spacingWidth = (levelNodes.length - 1) * HORIZONTAL_NODE_SPACING;
    const levelWidth = totalWidth + spacingWidth;
    levelWidths.push(levelWidth);
    maxLevelWidth = Math.max(maxLevelWidth, levelWidth);
  });
  
  // Use a reasonable container width with generous padding
  const containerWidth = Math.max(MIN_CONTAINER_WIDTH, maxLevelWidth + 300);
  const centerOffset = (containerWidth - maxLevelWidth) / 2;
  
  // Position nodes level by level with proper spacing
  levels.forEach((levelNodes, levelIndex) => {
    if (levelNodes.length === 0) return;
    
    const levelWidth = levelWidths[levelIndex];
    const levelCenterOffset = (maxLevelWidth - levelWidth) / 2;
    
    // Calculate positions for nodes in this level
    let currentX = centerOffset + levelCenterOffset;
    
    levelNodes.forEach((nodeId) => {
      const node = arrangedNodes.find(n => n.id === nodeId);
      if (!node) return;
      
      const dims = getNodeDimensions(node);
      
      // Position node
      nodePositions.set(nodeId, { 
        x: currentX, 
        y: currentY 
      });
      
      // Move to next position (node width + generous spacing)
      currentX += dims.width + HORIZONTAL_NODE_SPACING;
    });
    
    // Find max height in this level for next level positioning
    const maxHeight = Math.max(...levelNodes.map(id => {
      const node = arrangedNodes.find(n => n.id === id);
      return node ? getNodeDimensions(node).height : 0;
    }));
    
    // Add extra spacing after sections (every 2-3 levels)
    const extraSpacing = (levelIndex > 0 && levelIndex % 2 === 0) ? SECTION_SPACING : 0;
    currentY += maxHeight + VERTICAL_LEVEL_SPACING + extraSpacing;
  });
  
  // Position start node centered above first level
  startNode.x = centerOffset + (maxLevelWidth / 2) - (startDims.width / 2);
  startNode.y = startY;
  startNode.width = startDims.width;
  startNode.height = startDims.height;
  
  // Apply positions to all question nodes
  questionNodes.forEach(node => {
    const pos = nodePositions.get(node.id);
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
      const dims = getNodeDimensions(node);
      node.width = dims.width;
      node.height = dims.height;
    } else {
      // If node wasn't positioned (orphaned), place it at a default location
      const dims = getNodeDimensions(node);
      node.x = centerOffset + (maxLevelWidth / 2) - (dims.width / 2);
      node.y = currentY;
      node.width = dims.width;
      node.height = dims.height;
    }
  });
  
  // Position end node centered below last level with extra spacing
  const endDims = getNodeDimensions(endNode);
  endNode.x = centerOffset + (maxLevelWidth / 2) - (endDims.width / 2);
  endNode.y = currentY + VERTICAL_LEVEL_SPACING;
  endNode.width = endDims.width;
  endNode.height = endDims.height;

  return arrangedNodes;
}

/**
 * Recalculate section bounds with modern spacing and visual separation
 */
function recalculateSections(sections: Section[], nodes: Node[]): Section[] {
  return sections.map(section => {
    const sectionQuestions = nodes.filter(n => 
      n.type === 'question' && n.sectionId === section.id
    );

    if (sectionQuestions.length === 0) return section;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    sectionQuestions.forEach(q => {
      const dims = getNodeDimensions(q);
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x + dims.width);
      maxY = Math.max(maxY, q.y + dims.height);
    });

    return {
      ...section,
      x: minX - SECTION_PADDING,
      y: minY - SECTION_PADDING,
      width: (maxX - minX) + (SECTION_PADDING * 2),
      height: (maxY - minY) + (SECTION_PADDING * 2),
      questionIds: sectionQuestions.map(q => q.id),
    };
  });
}

/**
 * Main function to arrange the entire logigramme
 */
export function arrangeLogigramme(logigramme: Logigramme): Logigramme {
  // Arrange nodes
  const arrangedNodes = arrangeNodes(logigramme.nodes, logigramme.edges);
  
  // Recalculate sections if they exist
  let sections = logigramme.sections;
  if (sections && sections.length > 0) {
    sections = recalculateSections(sections, arrangedNodes);
  } else {
    // Generate sections if missing
    sections = generateSectionsFromNodes(arrangedNodes);
  }

  return {
    ...logigramme,
    nodes: arrangedNodes,
    sections: sections,
  };
}

/**
 * Generate sections from nodes if missing with better grouping
 */
function generateSectionsFromNodes(nodes: Node[]): Section[] {
  const questionNodes = nodes.filter(n => n.type === 'question');
  if (questionNodes.length === 0) return [];

  // Group questions by their y position (level) - use a larger threshold for better grouping
  const levelThreshold = 180; // Group nodes within 180px vertically
  const levels = new Map<number, Node[]>();
  
  questionNodes.forEach(q => {
    const level = Math.round(q.y / levelThreshold);
    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level)!.push(q);
  });

  const sections: Section[] = [];
  const sortedLevels = Array.from(levels.entries()).sort((a, b) => a[0] - b[0]);
  
  // Create sections for each level or group of levels (2-4 sections total)
  const numSections = Math.min(4, Math.max(2, Math.ceil(sortedLevels.length / 2)));
  const levelsPerSection = Math.ceil(sortedLevels.length / numSections);

  for (let i = 0; i < numSections; i++) {
    const startIdx = i * levelsPerSection;
    const endIdx = Math.min(startIdx + levelsPerSection, sortedLevels.length);
    const sectionLevels = sortedLevels.slice(startIdx, endIdx);
    
    const sectionQuestions: Node[] = [];
    sectionLevels.forEach(([_, nodes]) => {
      sectionQuestions.push(...nodes);
    });

    if (sectionQuestions.length === 0) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    sectionQuestions.forEach(q => {
      const dims = getNodeDimensions(q);
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x + dims.width);
      maxY = Math.max(maxY, q.y + dims.height);
    });

    const sectionId = `section${i + 1}`;
    
    // Assign sectionId to questions
    sectionQuestions.forEach(q => {
      q.sectionId = sectionId;
    });

    sections.push({
      id: sectionId,
      title: `Section ${i + 1}`,
      description: `This section contains ${sectionQuestions.length} question(s) covering related aspects of the survey topic.`,
      questionIds: sectionQuestions.map(q => q.id),
      x: minX - SECTION_PADDING,
      y: minY - SECTION_PADDING,
      width: (maxX - minX) + (SECTION_PADDING * 2),
      height: (maxY - minY) + (SECTION_PADDING * 2),
    });
  }

  return sections;
}
