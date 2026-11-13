function clean(value) {
  return String(value ?? "").trim();
}

function finiteNumber(value) {
  return value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function missingFields(fields) {
  return fields.filter(([, value, validator = clean]) => !validator(value)).map(([field]) => field);
}

/**
 * Validate that a saved mapping contains the provider metadata required to
 * build a real outbound order. A mapping row alone is not enough: old or
 * partial mappings must never make the activation screen look ready.
 */
export function mappingTechnicalIssue(provider, entityType, mapping) {
  if (!mapping) return { kind: "unmapped", reason: "Non abbinato" };
  const metadata = mapping.metadata && typeof mapping.metadata === "object" && !Array.isArray(mapping.metadata)
    ? mapping.metadata
    : {};

  let missing = [];
  if (provider === "tilby" && entityType === "menu_item") {
    missing = missingFields([
      ["department.id", metadata.department?.id],
      ["vatPerc", metadata.vatPerc, finiteNumber],
    ]);
  } else if (provider === "tilby" && entityType === "table") {
    missing = missingFields([
      ["tableId", metadata.tableId],
      ["tableName", metadata.tableName],
      ["roomId", metadata.roomId],
      ["roomName", metadata.roomName],
    ]);
  } else if (provider === "teamsystem_cassa_in_cloud" && entityType === "menu_item") {
    missing = missingFields([
      ["idProductVariant", metadata.idProductVariant],
      ["idDepartment", metadata.idDepartment],
      ["idTax", metadata.idTax],
    ]);
  } else if (provider === "teamsystem_cassa_in_cloud" && entityType === "table") {
    missing = missingFields([["tableId", metadata.tableId]]);
  }

  return missing.length
    ? { kind: "incomplete", reason: `Dati tecnici incompleti: ${missing.join(", ")}`, missingFields: missing }
    : null;
}

export function summarizeIntegrationMappings({ provider, local, mappings = [] }) {
  const index = new Map(mappings.map((row) => [`${row.entityType}:${row.localId}`, row]));
  const requiredMenu = (local?.menuItems || []).filter((item) => (
    (!item.virtual && item.isAvailable !== false) || (item.virtual && item.optional === false)
  ));
  const requiredTables = local?.tables || [];
  const missing = [];

  function inspect(entityType, rows) {
    let readyCount = 0;
    for (const row of rows) {
      const issue = mappingTechnicalIssue(provider, entityType, index.get(`${entityType}:${row.id}`));
      if (!issue) {
        readyCount += 1;
        continue;
      }
      missing.push({
        entityType,
        localId: row.id,
        label: row.name,
        kind: issue.kind,
        reason: issue.reason,
        missingFields: issue.missingFields || [],
      });
    }
    return readyCount;
  }

  const readyMenu = inspect("menu_item", requiredMenu);
  const readyTables = inspect("table", requiredTables);
  return {
    menu: { mapped: readyMenu, total: requiredMenu.length },
    tables: { mapped: readyTables, total: requiredTables.length },
    missing,
    ready: missing.length === 0 && requiredMenu.length > 0 && requiredTables.length > 0,
  };
}
