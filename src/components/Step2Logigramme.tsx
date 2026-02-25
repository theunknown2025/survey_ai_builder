import { useState, useRef, useCallback, useEffect } from 'react';
import { Edit2, Trash2, Plus, Move, Sparkles, Loader2, Info, LayoutGrid, Eye, UploadCloud } from 'lucide-react';
import { Logigramme, Node, Edge, QuestionType, Section } from '../types/survey';
import { generateFollowupQuestions } from '../utils/generateFollowupQuestions';
import { arrangeLogigramme } from '../utils/arrangeLogigramme';
import { uploadSurveyImage } from '../lib/imageUpload';

interface Step2LogigrammeProps {
  logigramme: Logigramme | null;
  setLogigramme: (logigramme: Logigramme) => void;
  onNext: () => void;
  onBack: () => void;
  context: string;
}

const NODE_MIN_WIDTH = 200;
const NODE_MAX_WIDTH = 350;
const NODE_MIN_HEIGHT = 100;
const NODE_PADDING = 16;
const CIRCLE_DIAMETER = 100; // For start/end nodes
const NODE_SPACING = 40; // Minimum spacing between nodes
const CONTAINER_PADDING = 50; // Padding around container
const CONTAINER_GROWTH_MARGIN = 200; // Extra space to add when growing

export default function Step2Logigramme({ logigramme, setLogigramme, onNext, onBack, context }: Step2LogigrammeProps) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [draggingNode, setDraggingNode] = useState<Node | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isAddQuestionModalOpen, setIsAddQuestionModalOpen] = useState(false);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [showSectionInfo, setShowSectionInfo] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const handleEditNode = (node: Node) => {
    if (node.type === 'question') {
      setEditingNode({ ...node });
      setIsEditModalOpen(true);
    }
  };

  const handleSaveNode = () => {
    if (!editingNode || !logigramme) return;

    const updatedNodes = logigramme.nodes.map(node =>
      node.id === editingNode.id ? editingNode : node
    );

    setLogigramme({ ...logigramme, nodes: updatedNodes });
    setIsEditModalOpen(false);
    setEditingNode(null);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!logigramme) return;
    if (window.confirm('Are you sure you want to delete this question?')) {
      const updatedNodes = logigramme.nodes.filter(node => node.id !== nodeId);
      const updatedEdges = logigramme.edges.filter(
        edge => edge.from !== nodeId && edge.to !== nodeId
      );
      setLogigramme({ nodes: updatedNodes, edges: updatedEdges });
    }
  };

  const handleAddOption = () => {
    if (!editingNode) return;
    const newOptions = [...(editingNode.options || []), ''];
    setEditingNode({ ...editingNode, options: newOptions });
  };

  const handleUpdateOption = (index: number, value: string) => {
    if (!editingNode) return;
    const newOptions = [...(editingNode.options || [])];
    newOptions[index] = value;
    setEditingNode({ ...editingNode, options: newOptions });
  };

  const handleDeleteOption = (index: number) => {
    if (!editingNode) return;
    const newOptions = editingNode.options?.filter((_, i) => i !== index) || [];
    setEditingNode({ ...editingNode, options: newOptions });
  };

  const handleImageUploadClick = () => {
    setImageUploadError(null);
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = '';
      imageFileInputRef.current.click();
    }
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editingNode) return;

    setIsUploadingImage(true);
    setImageUploadError(null);

    try {
      const url = await uploadSurveyImage(file);
      setEditingNode((prev) =>
        prev
          ? {
              ...prev,
              imageUrl: url,
              imageAlt: prev.imageAlt || file.name,
            }
          : prev
      );
    } catch (error) {
      console.error('Error uploading image:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to upload image. Please try again.';
      setImageUploadError(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    
    setDraggingNode(node);
    setDragOffset({
      x: startX - node.x,
      y: startY - node.y
    });
    setSelectedNode(node);
  }, []);

  // Calculate node dimensions based on content
  const getNodeDimensions = useCallback((node: Node) => {
    if (node.type === 'start' || node.type === 'end') {
      return { width: CIRCLE_DIAMETER, height: CIRCLE_DIAMETER };
    }
    
    // Calculate width based on content
    const labelLength = node.label.length;
    const optionsCount = node.options?.length || 0;
    
    // Base width on label length, with min/max constraints
    let calculatedWidth = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, labelLength * 8 + NODE_PADDING * 2));
    
    // Adjust for options if present
    if (optionsCount > 0) {
      const maxOptionLength = Math.max(...(node.options?.map(opt => opt.length) || [0]));
      calculatedWidth = Math.max(calculatedWidth, Math.min(NODE_MAX_WIDTH, maxOptionLength * 7 + NODE_PADDING * 2));
    }
    
    // Calculate height based on content
    const baseHeight = NODE_MIN_HEIGHT;
    const labelLines = Math.ceil(labelLength / 40); // Approximate lines
    const optionsHeight = optionsCount > 0 ? (Math.min(optionsCount, 3) * 20) + 20 : 0;
    const calculatedHeight = Math.max(baseHeight, baseHeight + (labelLines - 1) * 20 + optionsHeight);
    
    return { width: calculatedWidth, height: calculatedHeight };
  }, []);

  // Calculate required container size based on all nodes and sections
  const calculateContainerSize = useCallback((nodes: Node[], sections?: Section[]) => {
    if (nodes.length === 0) {
      return { width: 1400, height: 800 };
    }

    let maxX = 0;
    let maxY = 0;
    let minX = Infinity;
    let minY = Infinity;

    // Calculate bounds from nodes
    nodes.forEach(node => {
      const nodeDims = getNodeDimensions(node);
      const nodeRight = node.x + nodeDims.width + NODE_SPACING;
      const nodeBottom = node.y + nodeDims.height + NODE_SPACING;
      
      maxX = Math.max(maxX, nodeRight);
      maxY = Math.max(maxY, nodeBottom);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
    });

    // Also consider sections if they exist
    if (sections && sections.length > 0) {
      sections.forEach(section => {
        const sectionRight = section.x + section.width;
        const sectionBottom = section.y + section.height;
        
        maxX = Math.max(maxX, sectionRight);
        maxY = Math.max(maxY, sectionBottom);
        minX = Math.min(minX, section.x);
        minY = Math.min(minY, section.y);
      });
    }

    // Add generous padding and growth margin for modern spacing
    const requiredWidth = Math.max(1400, maxX - minX + CONTAINER_PADDING * 2 + CONTAINER_GROWTH_MARGIN);
    const requiredHeight = Math.max(800, maxY - minY + CONTAINER_PADDING * 2 + CONTAINER_GROWTH_MARGIN);

    return { width: requiredWidth, height: requiredHeight };
  }, [getNodeDimensions]);

  // Update container size when nodes or sections change
  useEffect(() => {
    if (logigramme && logigramme.nodes.length > 0) {
      const newSize = calculateContainerSize(logigramme.nodes, logigramme.sections);
      setContainerSize(newSize);
    } else if (logigramme && logigramme.nodes.length === 0) {
      // Initialize with default size
      setContainerSize({ width: 1400, height: 800 });
    }
  }, [logigramme?.nodes, logigramme?.sections, calculateContainerSize]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingNode || !containerRef.current || !logigramme) return;

    const rect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragOffset.x;
    const newY = e.clientY - rect.top - dragOffset.y;

    const nodeSize = (draggingNode.type === 'start' || draggingNode.type === 'end') ? CIRCLE_DIAMETER : NODE_MAX_WIDTH;
    const nodeHeight = (draggingNode.type === 'start' || draggingNode.type === 'end') ? CIRCLE_DIAMETER : NODE_MIN_HEIGHT;
    
    // Allow movement beyond current container, but ensure minimum padding
    const minX = CONTAINER_PADDING;
    const minY = CONTAINER_PADDING;
    
    // Calculate max bounds based on current container size or grow if needed
    const currentMaxX = Math.max(containerSize.width, rect.width) - nodeSize - CONTAINER_PADDING;
    const currentMaxY = Math.max(containerSize.height, rect.height) - nodeHeight - CONTAINER_PADDING;

    // Allow movement beyond current bounds - container will grow
    const constrainedX = Math.max(minX, newX);
    const constrainedY = Math.max(minY, newY);

    // Update node position
    const updatedNodes = logigramme.nodes.map(node =>
      node.id === draggingNode.id
        ? { ...node, x: constrainedX, y: constrainedY }
        : node
    );

    // Calculate new container size if node moved beyond current bounds
    const newRequiredSize = calculateContainerSize(updatedNodes, logigramme.sections);
    if (newRequiredSize.width > containerSize.width || newRequiredSize.height > containerSize.height) {
      setContainerSize(newRequiredSize);
    }

    setLogigramme({ ...logigramme, nodes: updatedNodes });
  }, [draggingNode, dragOffset, logigramme, setLogigramme, containerSize, calculateContainerSize]);

  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  // Set up global mouse event listeners for dragging
  useEffect(() => {
    if (draggingNode) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNode, handleMouseMove, handleMouseUp]);

  // Calculate edge path for SVG with straight lines (angles)
  const getEdgePath = (fromNode: Node, toNode: Node): string => {
    const fromDims = getNodeDimensions(fromNode);
    const toDims = getNodeDimensions(toNode);
    
    // Account for node margin (NODE_SPACING / 2) to align with visual borders
    const nodeMargin = NODE_SPACING / 2;
    
    // From node: center horizontally, bottom edge vertically
    const fromX = fromNode.x + nodeMargin + fromDims.width / 2;
    const fromY = fromNode.y + nodeMargin + fromDims.height;
    
    // To node: center horizontally, top edge vertically
    const toX = toNode.x + nodeMargin + toDims.width / 2;
    const toY = toNode.y + nodeMargin;

    // Create a straight line path
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  };

  const getEdgeLabelPosition = (fromNode: Node, toNode: Node) => {
    const fromDims = getNodeDimensions(fromNode);
    const toDims = getNodeDimensions(toNode);
    
    // Account for node margin (NODE_SPACING / 2) to align with visual borders
    const nodeMargin = NODE_SPACING / 2;
    
    // From node: center horizontally, bottom edge vertically
    const fromX = fromNode.x + nodeMargin + fromDims.width / 2;
    const fromY = fromNode.y + nodeMargin + fromDims.height;
    
    // To node: center horizontally, top edge vertically
    const toX = toNode.x + nodeMargin + toDims.width / 2;
    const toY = toNode.y + nodeMargin;
    
    return {
      x: (fromX + toX) / 2,
      y: (fromY + toY) / 2
    };
  };

  const handleAddNewQuestion = () => {
    if (!logigramme) return;
    
    const newQuestionId = `q_${Date.now()}`;
    const newQuestion: Node = {
      id: newQuestionId,
      type: 'question',
      label: 'New Question',
      questionType: 'text',
      x: 200,
      y: 300,
    };

    // Find a good position with spacing
    const questionNodes = logigramme.nodes.filter(n => n.type === 'question');
    if (questionNodes.length > 0) {
      const lastQuestion = questionNodes[questionNodes.length - 1];
      newQuestion.x = lastQuestion.x + NODE_MAX_WIDTH + NODE_SPACING;
      newQuestion.y = lastQuestion.y;
    } else {
      // Position after start node or in center
      const startNode = logigramme.nodes.find(n => n.type === 'start');
      if (startNode) {
        newQuestion.x = startNode.x;
        newQuestion.y = startNode.y + CIRCLE_DIAMETER + NODE_SPACING;
      } else {
        newQuestion.x = CONTAINER_PADDING;
        newQuestion.y = CONTAINER_PADDING + 200;
      }
    }

    const updatedNodes = [...logigramme.nodes, newQuestion];
    
    // Connect to start if no edges exist, or to the last question
    const startNode = logigramme.nodes.find(n => n.type === 'start');
    let newEdges = [...logigramme.edges];
    
    if (startNode && questionNodes.length === 0) {
      // First question, connect from start
      newEdges.push({
        id: `e_${Date.now()}`,
        from: startNode.id,
        to: newQuestionId,
        label: '',
      });
    } else if (questionNodes.length > 0) {
      // Connect from last question
      const lastQuestion = questionNodes[questionNodes.length - 1];
      newEdges.push({
        id: `e_${Date.now()}`,
        from: lastQuestion.id,
        to: newQuestionId,
        label: 'Continue',
      });
    }

    setLogigramme({ nodes: updatedNodes, edges: newEdges });
    setEditingNode(newQuestion);
    setIsEditModalOpen(true);
  };

  const handleGenerateAIFollowups = async () => {
    if (!selectedNode || !logigramme || selectedNode.type !== 'question') {
      alert('Please select a question node first');
      return;
    }

    setIsAIGenerating(true);
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

      if (!apiKey) {
        throw new Error('OpenAI API key is not configured');
      }

      const data = await generateFollowupQuestions({
        question: selectedNode,
        context: context || aiPrompt,
        existingNodes: logigramme.nodes,
        apiKey,
      });
      
      // Merge new nodes and edges into existing logigramme
      const updatedNodes = [...logigramme.nodes, ...data.nodes];
      const updatedEdges = [...logigramme.edges, ...data.edges.map((edge: Edge) => ({
        ...edge,
        from: edge.from === 'q_original_id' ? selectedNode.id : edge.from,
      }))];

      setLogigramme({ nodes: updatedNodes, edges: updatedEdges });
      setAiPrompt('');
      alert(`Successfully added ${data.nodes.length} follow-up question(s)!`);
    } catch (error) {
      console.error('Error generating follow-up questions:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate follow-up questions. Please try again.');
    } finally {
      setIsAIGenerating(false);
    }
  };

  // Auto-generate sections if missing (only once when logigramme is first loaded)
  useEffect(() => {
    if (logigramme && (!logigramme.sections || logigramme.sections.length === 0)) {
      const questionNodes = logigramme.nodes.filter(n => n.type === 'question');
      if (questionNodes.length > 0) {
        const generatedSections = generateSectionsFromNodes(logigramme.nodes);
        const updatedNodes = logigramme.nodes.map(node => {
          if (node.type === 'question' && !node.sectionId) {
            // Find which section this question belongs to
            const section = generatedSections.find(s => s.questionIds.includes(node.id));
            return { ...node, sectionId: section?.id || generatedSections[0]?.id };
          }
          return node;
        });
        setLogigramme({ ...logigramme, nodes: updatedNodes, sections: generatedSections });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logigramme?.nodes.length, logigramme?.sections?.length]); // Only run when structure changes

  // Helper function to generate sections from nodes
  const generateSectionsFromNodes = useCallback((nodes: Node[]): Section[] => {
    const questionNodes = nodes.filter(n => n.type === 'question');
    if (questionNodes.length === 0) return [];

    // Group questions into logical sections (2-4 sections)
    const numSections = Math.min(4, Math.max(2, Math.ceil(questionNodes.length / 3)));
    const questionsPerSection = Math.ceil(questionNodes.length / numSections);
    
    const sections: Section[] = [];
    const sectionPadding = 20;

    for (let i = 0; i < numSections; i++) {
      const startIdx = i * questionsPerSection;
      const endIdx = Math.min(startIdx + questionsPerSection, questionNodes.length);
      const sectionQuestions = questionNodes.slice(startIdx, endIdx);
      
      if (sectionQuestions.length === 0) continue;

      // Calculate section bounds using actual node dimensions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      sectionQuestions.forEach(q => {
        const dims = getNodeDimensions(q);
        minX = Math.min(minX, q.x);
        minY = Math.min(minY, q.y);
        maxX = Math.max(maxX, q.x + dims.width);
        maxY = Math.max(maxY, q.y + dims.height);
      });

      const sectionId = `section${i + 1}`;

      sections.push({
        id: sectionId,
        title: `Section ${i + 1}`,
        description: `This section covers questions ${startIdx + 1} to ${endIdx} of the survey, focusing on related aspects of the topic.`,
        questionIds: sectionQuestions.map(q => q.id),
        x: minX - sectionPadding,
        y: minY - sectionPadding,
        width: (maxX - minX) + (sectionPadding * 2),
        height: (maxY - minY) + (sectionPadding * 2),
      });
    }

    return sections;
  }, [getNodeDimensions]);

  if (!logigramme) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No logigramme generated yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Edit Logigramme</h2>
      <p className="text-gray-600 mb-4">
        Review and edit the generated survey flow. Drag nodes to reposition them, or click on any question to edit it.
      </p>

      {/* Action buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => {
            if (!logigramme) return;
            const arranged = arrangeLogigramme(logigramme);
            setLogigramme(arranged);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-all"
          title="Automatically arrange and position all questions and sections"
        >
          <LayoutGrid className="w-5 h-5" />
          Arrange
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6 overflow-auto">
        <div 
          ref={containerRef}
          className="relative bg-gray-50 rounded-lg" 
          style={{ 
            height: `${Math.max(containerSize.height || 800, window.innerHeight - 300)}px`,
            minHeight: '600px',
            width: `${Math.max(containerSize.width || 1400, 1400)}px`,
            minWidth: '100%',
            position: 'relative',
            transition: 'width 0.3s ease-out, height 0.3s ease-out'
          }}
        >
          {/* Sections layer - rendered behind nodes */}
          {logigramme.sections && logigramme.sections.length > 0 && (
            <div className="absolute inset-0" style={{ zIndex: 0, pointerEvents: 'none' }}>
              {logigramme.sections.map((section: Section) => (
                <div
                  key={section.id}
                  style={{
                    position: 'absolute',
                    left: `${section.x}px`,
                    top: `${section.y}px`,
                    width: `${section.width}px`,
                    height: `${section.height}px`,
                    pointerEvents: 'auto',
                  }}
                  className="relative"
                  onMouseEnter={() => setHoveredSection(section.id)}
                  onMouseLeave={() => setHoveredSection(null)}
                >
                  {/* Section background */}
                  <div
                    className={`
                      absolute inset-0 rounded-xl border-2 border-dashed
                      ${hoveredSection === section.id 
                        ? 'bg-indigo-50/80 border-indigo-400 shadow-lg' 
                        : 'bg-indigo-50/40 border-indigo-200'
                      }
                      transition-all duration-300
                      backdrop-blur-sm
                    `}
                    style={{
                      boxShadow: hoveredSection === section.id 
                        ? '0 4px 12px rgba(99, 102, 241, 0.15)' 
                        : '0 2px 6px rgba(99, 102, 241, 0.08)'
                    }}
                  />
                  
                  {/* Section header with info icon */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10 pointer-events-auto">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-gray-800 truncate max-w-[200px]">
                        {section.title}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSectionInfo(showSectionInfo === section.id ? null : section.id);
                        }}
                        className={`
                          p-1.5 rounded-full transition-all
                          ${hoveredSection === section.id || showSectionInfo === section.id
                            ? 'bg-indigo-200 text-indigo-700 hover:bg-indigo-300 shadow-sm'
                            : 'bg-indigo-100/70 text-indigo-600 hover:bg-indigo-200'
                          }
                        `}
                        title="Section information"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Section description tooltip */}
                  {showSectionInfo === section.id && (
                    <div
                      className="absolute top-10 left-2 right-2 z-20 bg-white border-2 border-indigo-200 rounded-xl shadow-xl p-4 pointer-events-auto"
                      style={{ maxWidth: '320px' }}
                    >
                      <div className="text-sm font-semibold text-indigo-900 mb-2">
                        {section.title}
                      </div>
                      <div className="text-xs text-gray-700 leading-relaxed">
                        {section.description}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSectionInfo(null);
                        }}
                        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Nodes layer */}
          <div className="relative" style={{ zIndex: 1 }}>
            {logigramme.nodes.map((node) => {
              const isCircular = node.type === 'start' || node.type === 'end';
              const nodeDims = getNodeDimensions(node);
              const nodeSize = nodeDims.width;
              const nodeHeight = nodeDims.height;

              return (
                <div
                  key={node.id}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${nodeSize}px`,
                    minWidth: `${isCircular ? CIRCLE_DIAMETER : NODE_MIN_WIDTH}px`,
                    maxWidth: `${isCircular ? CIRCLE_DIAMETER : NODE_MAX_WIDTH}px`,
                    height: `${nodeHeight}px`,
                    minHeight: `${isCircular ? CIRCLE_DIAMETER : NODE_MIN_HEIGHT}px`,
                    margin: `${NODE_SPACING / 2}px`,
                    transition: draggingNode?.id === node.id ? 'none' : 'all 0.2s ease-out',
                  }}
                  className="flex flex-col items-center justify-center"
                >
                  <div
                    onMouseDown={(e) => handleMouseDown(e, node)}
                    onClick={(e) => {
                      // Only handle selection for start/end nodes, not questions
                      // Questions should only be editable via the edit icon
                      if (!draggingNode && (node.type === 'start' || node.type === 'end')) {
                        setSelectedNode(node);
                      }
                    }}
                    className={`
                      ${node.type === 'start' ? 'bg-green-100 border-green-500' : ''}
                      ${node.type === 'end' ? 'bg-red-100 border-red-500' : ''}
                      ${node.type === 'question' ? 'bg-blue-50 border-blue-500 hover:shadow-lg' : ''}
                      border-2 ${isCircular ? 'rounded-full' : 'rounded-lg'} p-4 w-full h-full transition-all
                      ${selectedNode?.id === node.id ? 'ring-4 ring-blue-300' : ''}
                      ${draggingNode?.id === node.id ? 'cursor-grabbing shadow-2xl scale-105 z-50' : 'cursor-grab'}
                      ${node.type === 'question' ? 'hover:border-blue-600' : 'hover:shadow-md'}
                      flex items-center justify-center
                    `}
                  >
                    {isCircular ? (
                      <div className="text-center">
                        <div className={`font-bold text-sm ${node.type === 'start' ? 'text-green-700' : 'text-red-700'} uppercase mb-1`}>
                          {node.type === 'start' ? 'Start' : 'End'}
                        </div>
                        <Move className={`w-4 h-4 mx-auto ${node.type === 'start' ? 'text-green-600' : 'text-red-600'}`} />
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col p-3 overflow-hidden">
                        <div className="flex items-start justify-between gap-2 mb-2 flex-shrink-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="font-semibold text-xs text-gray-700 uppercase truncate">
                                {node.questionType}
                              </div>
                              <Move className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            </div>
                            <div className="text-gray-900 font-medium text-sm leading-tight break-words">
                              {node.label}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditNode(node);
                              }}
                              className="p-1.5 hover:bg-blue-100 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4 text-blue-600" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteNode(node.id);
                              }}
                              className="p-1.5 hover:bg-red-100 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>

                        {node.options && node.options.length > 0 && (
                          <div className="mt-auto space-y-1 w-full overflow-y-auto flex-1">
                            <div className="text-xs text-gray-500 font-semibold">Options:</div>
                            <div className="space-y-0.5">
                              {node.options.slice(0, 4).map((option, idx) => (
                                <div key={idx} className="text-xs text-gray-600 pl-2 border-l-2 border-gray-300 break-words">
                                  {option}
                                </div>
                              ))}
                              {node.options.length > 4 && (
                                <div className="text-xs text-gray-400 pl-2 italic">
                                  +{node.options.length - 4} more
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* SVG layer for edges - rendered on top of all cards and sections */}
          <svg 
            className="absolute inset-0 pointer-events-none" 
            style={{ 
              width: '100%', 
              height: '100%', 
              zIndex: 2
            }}
          >
            {logigramme.edges.map((edge) => {
              const fromNode = logigramme.nodes.find(n => n.id === edge.from);
              const toNode = logigramme.nodes.find(n => n.id === edge.to);
              if (!fromNode || !toNode) return null;

              const path = getEdgePath(fromNode, toNode);
              const labelPos = getEdgeLabelPosition(fromNode, toNode);

              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    stroke="#6366f1"
                    strokeWidth="2.5"
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    className="transition-all duration-300 hover:stroke-indigo-600"
                    style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
                  />
                  {edge.label && (
                    <g>
                      <rect
                        x={labelPos.x - (edge.label.length * 4 + 10)}
                        y={labelPos.y - 12}
                        width={edge.label.length * 8 + 20}
                        height="24"
                        fill="#ffffff"
                        rx="6"
                        stroke="#6366f1"
                        strokeWidth="1.5"
                        className="pointer-events-auto"
                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                      />
                      <text
                        x={labelPos.x}
                        y={labelPos.y + 4}
                        textAnchor="middle"
                        className="text-xs fill-indigo-700 font-semibold pointer-events-none"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            {/* Arrow marker definition */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="3.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <polygon 
                  points="0 0, 12 3.5, 0 7" 
                  fill="#6366f1"
                  style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.1))' }}
                />
              </marker>
            </defs>
          </svg>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button
          onClick={onNext}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          View Preview
          <Eye className="w-5 h-5" />
        </button>
      </div>

      {isEditModalOpen && editingNode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Edit Question</h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question Text
                </label>
                <textarea
                  value={editingNode.label}
                  onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question Type
                </label>
                <select
                  value={editingNode.questionType}
                  onChange={(e) => setEditingNode({ ...editingNode, questionType: e.target.value as QuestionType })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="multiple-choice">Multiple Choice</option>
                  <option value="text">Text</option>
                  <option value="rating">Rating</option>
                  <option value="yes-no">Yes/No</option>
                </select>
              </div>

              {(editingNode.questionType === 'multiple-choice' || editingNode.questionType === 'yes-no') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Options
                  </label>
                  <div className="space-y-2">
                    {editingNode.options?.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => handleUpdateOption(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => handleDeleteOption(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={handleAddOption}
                      className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg font-medium"
                    >
                      <Plus className="w-5 h-5" />
                      Add Option
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image URL (optional)
                </label>
                <input
                  type="text"
                  value={editingNode.imageUrl || ''}
                  onChange={(e) =>
                    setEditingNode({ ...editingNode, imageUrl: e.target.value })
                  }
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {editingNode.imageUrl && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">Preview</p>
                    <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                      <img
                        src={editingNode.imageUrl}
                        alt={editingNode.imageAlt || 'Question illustration'}
                        className="max-h-48 mx-auto rounded-md object-contain"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleImageUploadClick}
                    disabled={isUploadingImage}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        Upload image
                      </>
                    )}
                  </button>
                  {editingNode.imageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingNode({
                          ...editingNode,
                          imageUrl: undefined,
                          imageAlt: editingNode.imageAlt,
                        })
                      }
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove image
                    </button>
                  )}
                </div>

                {imageUploadError && (
                  <p className="mt-2 text-xs text-red-600">{imageUploadError}</p>
                )}

                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFileChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image alt text (optional)
                </label>
                <input
                  type="text"
                  value={editingNode.imageAlt || ''}
                  onChange={(e) =>
                    setEditingNode({ ...editingNode, imageAlt: e.target.value })
                  }
                  placeholder="Short description for screen readers"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingNode(null);
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNode}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Follow-up Questions Modal */}
      {isAddQuestionModalOpen && selectedNode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Generate AI Follow-up Questions</h3>
              <p className="text-sm text-gray-600 mt-1">
                Generate follow-up questions for: <span className="font-medium">{selectedNode.label}</span>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Context (Optional)
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Add any additional context or instructions for generating follow-up questions..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to use the original survey context, or provide specific instructions for the AI.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsAddQuestionModalOpen(false);
                  setAiPrompt('');
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsAddQuestionModalOpen(false);
                  await handleGenerateAIFollowups();
                }}
                disabled={isAIGenerating}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isAIGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Follow-ups
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
