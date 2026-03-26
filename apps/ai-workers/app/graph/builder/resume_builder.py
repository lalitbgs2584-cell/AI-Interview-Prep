from langgraph.graph import StateGraph, END
from app.graph.state.resume_processing_state import ResumeProcessState
from app.graph.nodes.resume_processing_node import (
    download_node,
    convert_images_node,
    ocr_node,
    clean_node,
    structured_node,
    chunk_node,
    embedding_node,
    store_qdrant_node,
    store_neo4j_node,
    store_neon_node,
    merge_node,
    ats_score_checker
)


# =========================
# Graph
# =========================
def build_resume_graph():
    builder = StateGraph(ResumeProcessState)

    builder.add_node("download", download_node)
    builder.add_node("convert", convert_images_node)
    builder.add_node("extract", ocr_node)
    builder.add_node("clean", clean_node)
    builder.add_node("structured", structured_node)
    builder.add_node("chunk", chunk_node)
    builder.add_node("embed", embedding_node)
    builder.add_node("store_qdrant", store_qdrant_node)
    builder.add_node("store_neo4j", store_neo4j_node)
    builder.add_node("store_neon", store_neon_node)
    builder.add_node("ats_score_node", ats_score_checker)

    builder.set_entry_point("download")

    builder.add_edge("download", "convert")
    builder.add_edge("convert", "extract")
    builder.add_edge("extract", "clean")
    builder.add_edge("clean", "structured")
    builder.add_edge("structured","ats_score_node")
    builder.add_edge("ats_score_node", "store_neo4j")
    builder.add_edge("store_neo4j", "chunk")
    builder.add_edge("chunk", "embed")
    builder.add_edge("embed", "store_qdrant")
    builder.add_edge("store_qdrant", "store_neon")
    builder.add_edge("store_neon", END)

    return builder.compile()