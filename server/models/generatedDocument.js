const prisma = require("../utils/prisma");

/**
 * @typedef {Object} GeneratedDocument
 * @property {number} id
 * @property {string} storageFilename          UUID-suffixed filename on disk
 * @property {string} displayFilename          User-facing filename
 * @property {string} fileType                 "docx" | "pdf" | "xlsx" | "pptx" | ...
 * @property {string|null} docType             "programa" | "plan" | "asesoria" | "informe" | null
 * @property {number} workspaceId
 * @property {number|null} threadId
 * @property {number|null} userId              null when the file was produced
 *                                             outside of a user session (e.g. a
 *                                             scheduled job); the row survives
 *                                             user deletion.
 * @property {number|null} chatId
 * @property {string|null} title
 * @property {number} fileSize                 bytes
 * @property {Date} createdAt
 * @property {Date|null} deletedAt             soft-delete marker
 */

const VALID_FILE_TYPES = ["docx", "pdf", "xlsx", "pptx", "txt", "text"];
const VALID_DOC_TYPES = ["programa", "plan", "asesoria", "informe"];

function toInt(v) {
  const n = Number(v);
  if (!Number.isInteger(n))
    throw new Error(`Expected integer, got ${JSON.stringify(v)}`);
  return n;
}
function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  return toInt(v);
}

const GeneratedDocument = {
  VALID_FILE_TYPES,
  VALID_DOC_TYPES,

  validations: {
    id: toInt,
    optId: toIntOrNull,
    fileType: (v) => {
      if (!VALID_FILE_TYPES.includes(v))
        throw new Error(`Invalid fileType: ${JSON.stringify(v)}`);
      return v;
    },
    docType: (v = null) => {
      if (v === null || v === undefined) return null;
      if (!VALID_DOC_TYPES.includes(v))
        throw new Error(`Invalid docType: ${JSON.stringify(v)}`);
      return v;
    },
    filename: (v) => {
      if (typeof v !== "string" || v.trim().length === 0)
        throw new Error("filename must be a non-empty string");
      return v;
    },
    size: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0)
        throw new Error(`Invalid fileSize: ${JSON.stringify(v)}`);
      return Math.trunc(n);
    },
  },

  /**
   * Insert a new document record. Called by the create-files agent right
   * after the file lands on disk under storage/generated-files/.
   * All context fields are optional so the same call site works for
   * scheduled jobs (no workspace/user) — those rows just get null.
   * @param {object} params
   * @param {string} params.storageFilename
   * @param {string} params.displayFilename
   * @param {string} params.fileType
   * @param {number} params.workspaceId
   * @param {string|null} [params.docType]
   * @param {number|null} [params.threadId]
   * @param {number|null} [params.userId]
   * @param {number|null} [params.chatId]
   * @param {string|null} [params.title]
   * @param {number} params.fileSize
   * @returns {Promise<GeneratedDocument|null>}
   */
  create: async function ({
    storageFilename,
    displayFilename,
    fileType,
    workspaceId,
    docType = null,
    threadId = null,
    userId = null,
    chatId = null,
    title = null,
    fileSize,
  }) {
    try {
      return await prisma.generated_documents.create({
        data: {
          storageFilename: this.validations.filename(storageFilename),
          displayFilename: this.validations.filename(displayFilename),
          fileType: this.validations.fileType(fileType),
          docType: this.validations.docType(docType),
          workspaceId: this.validations.id(workspaceId),
          threadId: this.validations.optId(threadId),
          userId: this.validations.optId(userId),
          chatId: this.validations.optId(chatId),
          title: title ? String(title).slice(0, 500) : null,
          fileSize: this.validations.size(fileSize),
        },
      });
    } catch (error) {
      console.error("[GeneratedDocument.create]", error.message);
      return null;
    }
  },

  /**
   * List documents matching a where clause with pagination.
   * @param {object} [clause]
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   * @param {object} [orderBy={createdAt: "desc"}]
   * @returns {Promise<GeneratedDocument[]>}
   */
  where: async function (
    clause = {},
    limit = 50,
    offset = 0,
    orderBy = { createdAt: "desc" }
  ) {
    try {
      return await prisma.generated_documents.findMany({
        where: { deletedAt: null, ...clause },
        take: Math.max(1, Math.min(Number(limit) || 50, 200)),
        skip: Math.max(0, Number(offset) || 0),
        orderBy,
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, username: true } },
        },
      });
    } catch (error) {
      console.error("[GeneratedDocument.where]", error.message);
      return [];
    }
  },

  /**
   * Count documents matching the where clause (respects soft-delete).
   * @param {object} [clause]
   * @returns {Promise<number>}
   */
  count: async function (clause = {}) {
    try {
      return await prisma.generated_documents.count({
        where: { deletedAt: null, ...clause },
      });
    } catch (error) {
      console.error("[GeneratedDocument.count]", error.message);
      return 0;
    }
  },

  /**
   * Fetch a single active document by id or by storageFilename.
   * @param {object} clause
   * @returns {Promise<GeneratedDocument|null>}
   */
  get: async function (clause = {}) {
    try {
      return await prisma.generated_documents.findFirst({
        where: { deletedAt: null, ...clause },
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, username: true } },
        },
      });
    } catch (error) {
      console.error("[GeneratedDocument.get]", error.message);
      return null;
    }
  },

  /**
   * Soft-delete a document by stamping deletedAt. The file on disk is left
   * in place so undelete stays trivial; cleanup of orphan files is a job
   * for a separate maintenance script.
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  softDelete: async function (id) {
    try {
      await prisma.generated_documents.update({
        where: { id: this.validations.id(id) },
        data: { deletedAt: new Date() },
      });
      return true;
    } catch (error) {
      console.error("[GeneratedDocument.softDelete]", error.message);
      return false;
    }
  },
};

module.exports = { GeneratedDocument };
