// Verbatim legacy oracle for the geometry layer (used by tests/unit/geometry.test.mjs).
//
// Every function body below was copied with `sed -n` from index.html@cd3fd3f (`git show cd3fd3f:index.html`).
// Edits are limited to:
//   - globals turned into parameters (`wallSections`, `allSectionsData`, `allSectionsGeometry`, `scale`);
//   - THREE / canvas / DOM / text-output statements deleted, each replaced by a `// [oracle]` comment;
//   - `// [oracle]`-marked statements that record the values a deleted statement consumed (pushes into a
//     result array), and a final `return`.
// No arithmetic, operand order, coercion or loop structure was changed. This file is THREE-free and DOM-free.
// It is a helper, not a test file: the unit glob `tests/unit/**/*.test.mjs` does not match it.

// ---------------------------------------------------------------------------------------------------------------
// createLEDWall layout walk: index.html 1479-1549 (globals: wallSections)
// ---------------------------------------------------------------------------------------------------------------

/** index.html 1479-1549. Returns the legacy `allSectionsData`. */
export function legacyCreateLEDWallWalk(wallSections) {
            const scale = 0.001;
            let allSectionsData = [];
            
            // Track cumulative position and angle across sections
            let currentX = 0;
            let currentZ = 0;
            let currentAngle = 0; // This is the direction the wall is "facing" (perpendicular to panel surface)

            wallSections.forEach((section, sectionIndex) => {
                const panelW = section.panelWidth * scale;
                const panelH = section.panelHeight * scale;
                // Curve angle is signed: positive = concave (curves toward viewer), negative = convex (curves away)
                const curveAngleRad = (section.curveIntensity * Math.PI) / 180;
                const isFlat = section.curveIntensity === 0;
                
                // Apply section angle offset before building this section
                const angleOffsetRad = ((section.angleOffset || 0) * Math.PI) / 180;
                currentAngle += angleOffsetRad;

                const edgePositions = [];
                const panelData = [];

                // First edge starts at current position with current angle
                edgePositions.push({ x: currentX, z: currentZ, angle: currentAngle });

                for (let col = 0; col < section.panelCols; col++) {
                    // Apply curve angle (rotation around Y axis)
                    // Positive curve = rotate left (increase angle), negative = rotate right (decrease angle)
                    if (!isFlat) {
                        currentAngle += curveAngleRad;
                    }

                    // Move perpendicular to the current facing direction
                    // If angle = 0, we're facing +Z, so we move along +X
                    // The panel edge moves in direction perpendicular to facing
                    const moveDirection = currentAngle; // Direction to move along the panel edge
                    
                    currentX += panelW * Math.cos(moveDirection);
                    currentZ += panelW * Math.sin(moveDirection);

                    edgePositions.push({ x: currentX, z: currentZ, angle: currentAngle });
                }

                // Calculate panel centers
                for (let row = 0; row < section.panelRows; row++) {
                    const y = row * panelH;

                    for (let col = 0; col < section.panelCols; col++) {
                        const leftEdge = edgePositions[col];
                        const rightEdge = edgePositions[col + 1];

                        const centerX = (leftEdge.x + rightEdge.x) / 2;
                        const centerZ = (leftEdge.z + rightEdge.z) / 2;
                        const centerY = y + panelH / 2;

                        const dx = rightEdge.x - leftEdge.x;
                        const dz = rightEdge.z - leftEdge.z;
                        const rotY = -Math.atan2(dz, dx);

                        panelData.push({
                            x: centerX, y: centerY, z: centerZ,
                            rotY, col, row, sectionIndex
                        });
                    }
                }

                allSectionsData.push({
                    section, sectionIndex, edgePositions, panelData,
                    panelW, panelH, isFlat
                });
            });
            return allSectionsData; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// createCombinedMesh arrays: index.html 1579-1644 (globals: wallSections; THREE part 1646-1677 not copied)
// ---------------------------------------------------------------------------------------------------------------

/** index.html 1580-1644. Returns the four arrays handed to THREE at 1647-1650, plus the LED totals. */
export function legacyCreateCombinedMeshArrays(allSectionsData, wallSections) {
            const vertPositions = [];
            const vertNormals = [];
            const vertUvs = [];
            const indices = [];
            let vertexOffset = 0;

            let totalLedX = 0, totalLedY = 0;
            wallSections.forEach(s => {
                totalLedX += s.panelCols * s.ledX;
                totalLedY = Math.max(totalLedY, s.panelRows * s.ledY);
            });

            let uvOffsetX = 0;

            allSectionsData.forEach(({ section, edgePositions, panelW, panelH, isFlat }) => {
                const sectionLedX = section.panelCols * section.ledX;
                const uvWidth = sectionLedX / totalLedX;

                for (let row = 0; row <= section.panelRows; row++) {
                    const y = row * panelH;
                    for (let col = 0; col <= section.panelCols; col++) {
                        const edge = edgePositions[col];
                        vertPositions.push(edge.x, y, edge.z);

                        // Normal points perpendicular to panel surface (outward toward viewer)
                        // At angle=0, normal is (0, 0, 1). As angle increases, normal rotates.
                        // Normal direction is 90 degrees from the edge direction
                        let nx, nz;
                        if (col < section.panelCols) {
                            const nextEdge = edgePositions[col + 1];
                            const dx = nextEdge.x - edge.x;
                            const dz = nextEdge.z - edge.z;
                            const len = Math.sqrt(dx * dx + dz * dz);
                            // Normal is perpendicular to edge direction, pointing outward
                            nx = -dz / len;
                            nz = dx / len;
                        } else {
                            // Last edge - use previous edge's direction
                            const prevEdge = edgePositions[col - 1];
                            const dx = edge.x - prevEdge.x;
                            const dz = edge.z - prevEdge.z;
                            const len = Math.sqrt(dx * dx + dz * dz);
                            nx = -dz / len;
                            nz = dx / len;
                        }
                        vertNormals.push(nx, 0, nz);

                        vertUvs.push(uvOffsetX + (col / section.panelCols) * uvWidth, row / section.panelRows);
                    }
                }

                const vertsPerRow = section.panelCols + 1;
                for (let row = 0; row < section.panelRows; row++) {
                    for (let col = 0; col < section.panelCols; col++) {
                        const bl = vertexOffset + row * vertsPerRow + col;
                        const br = bl + 1;
                        const tl = vertexOffset + (row + 1) * vertsPerRow + col;
                        const tr = tl + 1;
                        indices.push(bl, tl, tr, bl, tr, br);
                    }
                }

                vertexOffset += (section.panelCols + 1) * (section.panelRows + 1);
                uvOffsetX += uvWidth;
            });
            return { vertPositions, vertNormals, vertUvs, indices, totalLedX, totalLedY }; // [oracle]
}

/** The running offsets of createCombinedMesh: index.html 1584-1596 and 1642-1643 (grid loops 1598-1640 elided). */
export function legacyCombinedMeshBookkeeping(allSectionsData, wallSections) {
            const book = []; // [oracle]
            let vertexOffset = 0;

            let totalLedX = 0, totalLedY = 0;
            wallSections.forEach(s => {
                totalLedX += s.panelCols * s.ledX;
                totalLedY = Math.max(totalLedY, s.panelRows * s.ledY);
            });

            let uvOffsetX = 0;

            allSectionsData.forEach(({ section, edgePositions, panelW, panelH, isFlat }) => {
                const sectionLedX = section.panelCols * section.ledX;
                const uvWidth = sectionLedX / totalLedX;
                book.push({ vertexOffset, uvOffsetX, uvWidth }); // [oracle] the values the elided 1598-1640 read

                vertexOffset += (section.panelCols + 1) * (section.panelRows + 1);
                uvOffsetX += uvWidth;
            });
            return { totalLedX, totalLedY, book }; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// createCombinedPanelIdCanvas bookkeeping: index.html 1681-1705 (canvas statements deleted)
// ---------------------------------------------------------------------------------------------------------------

/** index.html 1681-1705. Returns the totals, the px/LED and, per section, the values the canvas calls received. */
export function legacyCombinedPanelIdBookkeeping(wallSections) {
            const calls = []; // [oracle]
            let totalLedX = 0, totalLedY = 0;
            wallSections.forEach(s => {
                totalLedX += s.panelCols * s.ledX;
                totalLedY = Math.max(totalLedY, s.panelRows * s.ledY);
            });

            const scale = Math.max(1, Math.min(4, Math.floor(4096 / Math.max(totalLedX, totalLedY))));
            // [oracle] 1688-1694 (canvas creation and background) deleted

            let xOffset = 0;
            let cumulativeCol = 0;
            wallSections.forEach((section, sectionIndex) => {
                // [oracle] 1699 createSectionPanelIdCanvas(section, sectionIndex, scale, cumulativeCol) deleted
                // Draw section canvas at correct position, accounting for different heights
                const yOffset = (totalLedY - section.panelRows * section.ledY) * scale;
                calls.push({ sectionIndex, startCol: cumulativeCol, xOffset, yOffset }); // [oracle] 1702 drawImage(..., xOffset * scale, yOffset)
                xOffset += section.panelCols * section.ledX;
                cumulativeCol += section.panelCols;
            });
            return { totalLedX, totalLedY, scale, calls }; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// createSectionMeshes arrays: index.html 1710-1774 (THREE statements deleted)
// ---------------------------------------------------------------------------------------------------------------

/** index.html 1711-1751 + 1772. Returns, per section, the four arrays of 1754-1757 and the start column of 1761. */
export function legacyCreateSectionMeshesArrays(allSectionsData) {
            const meshes = []; // [oracle]
            let cumulativeCol = 0;
            allSectionsData.forEach(({ section, sectionIndex, edgePositions, panelW, panelH, isFlat }) => {
                const vertPositions = [], vertNormals = [], vertUvs = [], indices = [];
                // [oracle] 1714 new THREE.Color(section.color) deleted

                for (let row = 0; row <= section.panelRows; row++) {
                    const y = row * panelH;
                    for (let col = 0; col <= section.panelCols; col++) {
                        const edge = edgePositions[col];
                        vertPositions.push(edge.x, y, edge.z);
                        
                        // Calculate normal from edge direction
                        let nx, nz;
                        if (col < section.panelCols) {
                            const nextEdge = edgePositions[col + 1];
                            const dx = nextEdge.x - edge.x;
                            const dz = nextEdge.z - edge.z;
                            const len = Math.sqrt(dx * dx + dz * dz);
                            nx = -dz / len;
                            nz = dx / len;
                        } else {
                            const prevEdge = edgePositions[col - 1];
                            const dx = edge.x - prevEdge.x;
                            const dz = edge.z - prevEdge.z;
                            const len = Math.sqrt(dx * dx + dz * dz);
                            nx = -dz / len;
                            nz = dx / len;
                        }
                        vertNormals.push(nx, 0, nz);
                        vertUvs.push(col / section.panelCols, row / section.panelRows);
                    }
                }

                const vertsPerRow = section.panelCols + 1;
                for (let row = 0; row < section.panelRows; row++) {
                    for (let col = 0; col < section.panelCols; col++) {
                        const bl = row * vertsPerRow + col, br = bl + 1;
                        const tl = (row + 1) * vertsPerRow + col, tr = tl + 1;
                        indices.push(bl, tl, tr, bl, tr, br);
                    }
                }

                // [oracle] 1753-1771 (BufferGeometry, material, mesh) deleted; 1761 passes cumulativeCol as startCol
                meshes.push({ vertPositions, vertNormals, vertUvs, indices, startCol: cumulativeCol }); // [oracle]
                cumulativeCol += section.panelCols;
            });
            return meshes; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// createIndividualPanels bookkeeping: index.html 1776-1802 (THREE statements deleted)
// ---------------------------------------------------------------------------------------------------------------

/** index.html 1777-1801. Returns, per panel, the label column/row of 1787 and the transform of 1796-1797. */
export function legacyCreateIndividualPanelsBookkeeping(allSectionsData) {
            const panels = []; // [oracle]
            let cumulativeCol = 0;
            allSectionsData.forEach(({ section, sectionIndex, panelData, panelW, panelH }) => {
                // [oracle] 1779 new THREE.Color(section.color) deleted

                panelData.forEach((data) => {
                    // [oracle] 1782-1793 (PlaneGeometry and material) deleted; the panel-ID branch 1787 calls
                    // createPanelIdTexture(cumulativeCol + data.col, data.row, sectionIndex, section.ledX, section.ledY, section)
                    panels.push({ col: cumulativeCol + data.col, row: data.row, ledX: section.ledX, ledY: section.ledY }); // [oracle]
                    // [oracle] 1795-1798 (mesh, position.set(data.x, data.y, data.z), rotation.y = data.rotY, add) deleted
                });
                cumulativeCol += section.panelCols;
            });
            return panels; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// Labels and px/LED: index.html 1991-1999, 2003, 2022-2024, 2054-2056, 2083-2084
// ---------------------------------------------------------------------------------------------------------------

export function getColumnLabel(index) {
            let label = '';
            let idx = index;
            do {
                label = String.fromCharCode(65 + (idx % 26)) + label;
                idx = Math.floor(idx / 26) - 1;
            } while (idx >= 0);
            return label;
        }

/** index.html 2003 (createPanelIdTexture px/LED). */
export function legacyPanelScale(ledX, ledY) {
            const scale = Math.max(4, Math.min(16, Math.floor(4096 / Math.max(ledX, ledY))));
            return scale; // [oracle]
}

/** index.html 2022-2024 (createPanelIdTexture label; `col` is already the global column). */
export function legacyPanelTextureLabel(col, row) {
            const colLabel = getColumnLabel(col);
            const rowLabel = (row + 1).toString();
            const label = `${colLabel}${rowLabel}`;
            return label; // [oracle]
}

/** index.html 2054-2056 (createSectionPanelIdCanvas px/LED). */
export function legacySectionScale(section, overrideScale) {
            const canvasWidth = section.panelCols * section.ledX;
            const canvasHeight = section.panelRows * section.ledY;
            const scale = overrideScale || Math.max(1, Math.min(4, Math.floor(4096 / Math.max(canvasWidth, canvasHeight))));
            return scale; // [oracle]
}

/** index.html 2083-2084 (createSectionPanelIdCanvas label). */
export function legacySectionCanvasLabel(startCol, col, row) {
                    const colLabel = getColumnLabel(startCol + col);
                    const label = `${colLabel}${row + 1}`;
                    return label; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// createSafeDistanceMesh edge walk: index.html 2591 + 2614-2647 (globals: wallSections)
// ---------------------------------------------------------------------------------------------------------------

/** index.html 2591, 2614-2647. Returns the legacy `allEdges`. */
export function legacySafeDistanceEdges(wallSections) {
            const scale = 0.001;
            // Build edge positions matching createLEDWall exactly
            let currentX = 0;
            let currentZ = 0;
            let currentAngle = 0;
            
            const allEdges = []; // Store all edges across all sections (flattened)

            wallSections.forEach((section, sectionIndex) => {
                const panelW = section.panelWidth * scale;
                const panelH = section.panelHeight * scale;
                const curveAngleRad = (section.curveIntensity * Math.PI) / 180;
                const isFlat = section.curveIntensity === 0;
                
                // Apply section angle offset
                const angleOffsetRad = ((section.angleOffset || 0) * Math.PI) / 180;
                currentAngle += angleOffsetRad;

                // Store first edge of section
                if (allEdges.length === 0) {
                    allEdges.push({ x: currentX, z: currentZ, angle: currentAngle });
                }

                for (let col = 0; col < section.panelCols; col++) {
                    if (!isFlat) {
                        currentAngle += curveAngleRad;
                    }

                    const moveDirection = currentAngle;
                    currentX += panelW * Math.cos(moveDirection);
                    currentZ += panelW * Math.sin(moveDirection);

                    allEdges.push({ x: currentX, z: currentZ, angle: currentAngle });
                }
            });
            return allEdges; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// generateAllSectionsGeometry: index.html 5012-5080 (globals: wallSections)
// ---------------------------------------------------------------------------------------------------------------

export function generateAllSectionsGeometry(wallSections, scale) {
            const allSectionsGeometry = [];
            let currentX = 0, currentZ = 0, currentAngle = 0;

            wallSections.forEach((section, sectionIndex) => {
                const panelW = section.panelWidth * scale;
                const panelH = section.panelHeight * scale;
                const curveAngleRad = (section.curveIntensity * Math.PI) / 180;
                const isFlat = section.curveIntensity === 0;
                
                // Apply section angle offset
                const angleOffsetRad = ((section.angleOffset || 0) * Math.PI) / 180;
                currentAngle += angleOffsetRad;

                const edgePositions = [{ x: currentX, z: currentZ, angle: currentAngle }];

                for (let col = 0; col < section.panelCols; col++) {
                    if (!isFlat) {
                        currentAngle += curveAngleRad;
                    }

                    const moveDirection = currentAngle;
                    currentX += panelW * Math.cos(moveDirection);
                    currentZ += panelW * Math.sin(moveDirection);
                    
                    edgePositions.push({ x: currentX, z: currentZ, angle: currentAngle });
                }

                // Generate vertices
                const vertices = [];
                for (let row = 0; row <= section.panelRows; row++) {
                    const y = row * panelH;
                    for (let col = 0; col <= section.panelCols; col++) {
                        const edge = edgePositions[col];
                        vertices.push(edge.x, y, edge.z);
                    }
                }

                // Generate panel data for individual panels mode
                const panelData = [];
                for (let row = 0; row < section.panelRows; row++) {
                    const y = row * panelH;
                    for (let col = 0; col < section.panelCols; col++) {
                        const leftEdge = edgePositions[col];
                        const rightEdge = edgePositions[col + 1];
                        const centerX = (leftEdge.x + rightEdge.x) / 2;
                        const centerZ = (leftEdge.z + rightEdge.z) / 2;
                        const centerY = y + panelH / 2;
                        const dx = rightEdge.x - leftEdge.x;
                        const dz = rightEdge.z - leftEdge.z;
                        const rotY = -Math.atan2(dz, dx);

                        panelData.push({ x: centerX, y: centerY, z: centerZ, rotY, col, row });
                    }
                }

                allSectionsGeometry.push({
                    section,
                    sectionIndex,
                    vertices,
                    edgePositions,
                    panelData,
                    panelW,
                    panelH
                });
            });

            return allSectionsGeometry;
        }

// ---------------------------------------------------------------------------------------------------------------
// OBJ index loops and panel quads: index.html 4573-4604, 4617-4658, 4670-4713 (text output replaced by pushes)
// ---------------------------------------------------------------------------------------------------------------

/** OBJ combined, index.html 4573 + 4591-4604. Returns the v indices of every `f` line, in file order. */
export function legacyObjCombinedFaces(allSectionsGeometry) {
            const faces = []; // [oracle]
                let vertexOffset = 1;
                allSectionsGeometry.forEach(({ section }) => {
                    const vertsPerRow = section.panelCols + 1;
                    for (let row = 0; row < section.panelRows; row++) {
                        for (let col = 0; col < section.panelCols; col++) {
                            const bl = vertexOffset + row * vertsPerRow + col;
                            const br = bl + 1;
                            const tl = vertexOffset + (row + 1) * vertsPerRow + col;
                            const tr = tl + 1;
                            faces.push(bl, tl, tr); // [oracle] 4599 `f ${bl}/${bl}/1 ${tl}/${tl}/1 ${tr}/${tr}/1\n`
                            faces.push(bl, tr, br); // [oracle] 4600 `f ${bl}/${bl}/1 ${tr}/${tr}/1 ${br}/${br}/1\n`
                        }
                    }
                    vertexOffset += (section.panelCols + 1) * (section.panelRows + 1);
                });
            return faces; // [oracle]
}

/** OBJ section mode, index.html 4617-4658. Returns, per section, the v and vt indices of its `f` lines. */
export function legacyObjSectionFaces(allSectionsGeometry) {
            const objects = []; // [oracle]
                let vertexOffset = 1;
                let texCoordOffset = 1;
                let normalOffset = 1;
                
                allSectionsGeometry.forEach(({ section, vertices }, sectionIndex) => {
                    const faces = [], texFaces = []; // [oracle]
                    const name = `Wall_${sectionIndex + 1}`; // [oracle] 4622-4623 `o Wall_${sectionIndex + 1}\n`, `usemtl ...`
                    // [oracle] 4625-4635 (v, vt and vn lines) deleted

                    const vertsPerRow = section.panelCols + 1;
                    for (let row = 0; row < section.panelRows; row++) {
                        for (let col = 0; col < section.panelCols; col++) {
                            const bl = vertexOffset + row * vertsPerRow + col;
                            const br = bl + 1;
                            const tl = vertexOffset + (row + 1) * vertsPerRow + col;
                            const tr = tl + 1;
                            const tbl = texCoordOffset + row * vertsPerRow + col;
                            const tbr = tbl + 1;
                            const ttl = texCoordOffset + (row + 1) * vertsPerRow + col;
                            const ttr = ttl + 1;
                            faces.push(bl, tl, tr); texFaces.push(tbl, ttl, ttr); // [oracle] 4648 `f ${bl}/${tbl}/${normalOffset} ...`
                            faces.push(bl, tr, br); texFaces.push(tbl, ttr, tbr); // [oracle] 4649 `f ${bl}/${tbl}/${normalOffset} ...`
                        }
                    }
                    objects.push({ name, faces, texFaces, normalOffset }); // [oracle]

                    const numVerts = (section.panelCols + 1) * (section.panelRows + 1);
                    vertexOffset += numVerts;
                    texCoordOffset += numVerts;
                    normalOffset += 1;
                    // [oracle] 4657 objContent += '\n' deleted
                });
            return objects; // [oracle]
}

/** OBJ panel mode, index.html 4670-4713. Returns, per panel, its name, corners, normal and face indices. */
export function legacyObjPanels(allSectionsGeometry) {
            const objects = []; // [oracle]
                let vertexOffset = 1;
                let texCoordOffset = 1;
                let normalOffset = 1;
                
                allSectionsGeometry.forEach(({ section, panelData, panelW, panelH }, sectionIndex) => {
                    panelData.forEach((panel) => {
                        const panelName = `Wall_${sectionIndex + 1}_Panel_R${panel.row + 1}_C${panel.col + 1}`;
                        // [oracle] 4677-4678 (o and usemtl lines) deleted

                        const hw = panelW / 2;
                        const hh = panelH / 2;
                        const cos = Math.cos(panel.rotY);
                        const sin = Math.sin(panel.rotY);

                        const corners = [
                            { x: panel.x + (-hw) * cos, y: panel.y - hh, z: panel.z - (-hw) * sin },
                            { x: panel.x + (hw) * cos,  y: panel.y - hh, z: panel.z - (hw) * sin },
                            { x: panel.x + (hw) * cos,  y: panel.y + hh, z: panel.z - (hw) * sin },
                            { x: panel.x + (-hw) * cos, y: panel.y + hh, z: panel.z - (-hw) * sin }
                        ];

                        // [oracle] 4692-4696 (v and vt lines) deleted

                        const nx = Math.sin(panel.rotY);
                        const nz = Math.cos(panel.rotY);
                        // [oracle] 4700 (vn line) deleted

                        const v = vertexOffset;
                        const t = texCoordOffset;
                        const n = normalOffset;
                        const faces = [], texFaces = []; // [oracle]
                        faces.push(v, v+3, v+2); texFaces.push(t, t+3, t+2); // [oracle] 4705 `f ${v}/${t}/${n} ${v+3}/${t+3}/${n} ${v+2}/${t+2}/${n}\n`
                        faces.push(v, v+2, v+1); texFaces.push(t, t+2, t+1); // [oracle] 4706 `f ${v}/${t}/${n} ${v+2}/${t+2}/${n} ${v+1}/${t+1}/${n}\n`
                        objects.push({ panelName, corners, nx, nz, faces, texFaces, n }); // [oracle]

                        vertexOffset += 4;
                        texCoordOffset += 4;
                        normalOffset += 1;
                        // [oracle] 4711 objContent += '\n' deleted
                    });
                });
            return objects; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// glTF index loops and panel quads: index.html 4831-4891 (addMesh calls replaced by pushes)
// ---------------------------------------------------------------------------------------------------------------

/** glTF combined, index.html 4831-4848. */
export function legacyGltfCombined(allSectionsGeometry) {
                const allVertices = [];
                const allIndices = [];
                let indexOffset = 0;

                allSectionsGeometry.forEach(({ section, vertices }) => {
                    for (let i = 0; i < vertices.length; i++) allVertices.push(vertices[i]);
                    const vertsPerRow = section.panelCols + 1;
                    for (let row = 0; row < section.panelRows; row++) {
                        for (let col = 0; col < section.panelCols; col++) {
                            const bl = indexOffset + row * vertsPerRow + col;
                            const br = bl + 1;
                            const tl = indexOffset + (row + 1) * vertsPerRow + col;
                            const tr = tl + 1;
                            allIndices.push(bl, tl, tr, bl, tr, br);
                        }
                    }
                    indexOffset += (section.panelCols + 1) * (section.panelRows + 1);
                });
            return { allVertices, allIndices }; // [oracle]
}

/** glTF section mode, index.html 4854-4868. Returns, per section, the addMesh arguments. */
export function legacyGltfSections(allSectionsGeometry) {
            const meshes = []; // [oracle]
                allSectionsGeometry.forEach(({ section, vertices }, sectionIndex) => {
                    const indices = [];
                    const vertsPerRow = section.panelCols + 1;
                    for (let row = 0; row < section.panelRows; row++) {
                        for (let col = 0; col < section.panelCols; col++) {
                            const bl = row * vertsPerRow + col;
                            const br = bl + 1;
                            const tl = (row + 1) * vertsPerRow + col;
                            const tr = tl + 1;
                            indices.push(bl, tl, tr, bl, tr, br);
                        }
                    }
                    // [oracle] 4866 new THREE.Color(section.color) deleted
                    meshes.push({ name: `Wall_${sectionIndex + 1}`, vertices, indices }); // [oracle] 4867 addMesh(`Wall_${sectionIndex + 1}`, vertices, indices, color)
                });
            return meshes; // [oracle]
}

/** glTF panel mode, index.html 4871-4891. Returns, per panel, the addMesh arguments. */
export function legacyGltfPanels(allSectionsGeometry) {
            const meshes = []; // [oracle]
                allSectionsGeometry.forEach(({ section, panelData, panelW, panelH }, sectionIndex) => {
                    // [oracle] 4872 new THREE.Color(section.color) deleted

                    panelData.forEach((panel) => {
                        const hw = panelW / 2;
                        const hh = panelH / 2;
                        const cos = Math.cos(panel.rotY);
                        const sin = Math.sin(panel.rotY);

                        const vertices = [
                            panel.x + (-hw) * cos, panel.y - hh, panel.z - (-hw) * sin,
                            panel.x + (hw) * cos,  panel.y - hh, panel.z - (hw) * sin,
                            panel.x + (hw) * cos,  panel.y + hh, panel.z - (hw) * sin,
                            panel.x + (-hw) * cos, panel.y + hh, panel.z - (-hw) * sin
                        ];

                        const indices = [0, 3, 2, 0, 2, 1];
                        const name = `Wall_${sectionIndex + 1}_Panel_R${panel.row + 1}_C${panel.col + 1}`;
                        meshes.push({ name, vertices, indices }); // [oracle] 4889 addMesh(name, vertices, indices, color)
                    });
                });
            return meshes; // [oracle]
}

// ---------------------------------------------------------------------------------------------------------------
// Names: index.html 4496, 4511, 4534-4543 (exportZIP), 4607-4613 (MTL, section mode)
// ---------------------------------------------------------------------------------------------------------------

/** exportZIP: sanitizer 4496, JSON texture_file 4511, texture loop 4534-4543 (file names and start columns). */
export function legacyZipTextures(wallSections) {
            const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9_-]/g, '_');
            const jsonTextureFiles = wallSections.map((s, i) => ({ // [oracle] the 4501 map, texture_file only
                    texture_file: `textures/${sanitizeFilename(s.name || `Wall_${i + 1}`)}_PanelIDs.png`
            })); // [oracle]
            const files = []; // [oracle]
            let cumulativeCol = 0;
            for (let i = 0; i < wallSections.length; i++) {
                const section = wallSections[i];
                // [oracle] 4537-4539 (createSectionPanelIdCanvas(section, i, null, cumulativeCol), toDataURL) deleted
                const filename = `${sanitizeFilename(section.name || `Wall_${i + 1}`)}_PanelIDs.png`;
                files.push({ filename, startCol: cumulativeCol }); // [oracle] 4541 texturesFolder.file(filename, ...)
                cumulativeCol += section.panelCols;
            }
            return { jsonTextureFiles, files }; // [oracle]
}

/** MTL section mode, index.html 4607-4613. Returns the MTL text it appends. */
export function legacyMtlSectionText(wallSections) {
            let mtlContent = ''; // [oracle]
                wallSections.forEach((section, i) => {
                    // [oracle] 4608 new THREE.Color(section.color) deleted
                    mtlContent += `newmtl Wall_${i + 1}\n`;
                    // [oracle] 4610 (Kd line from the THREE colour) deleted
                    mtlContent += `Ka 0.1 0.1 0.1\nKs 0.5 0.5 0.5\nNs 100\nd 1.0\n`;
                    mtlContent += `map_Kd textures/Wall_${i + 1}_PanelIDs.png\n\n`;
                });
            return mtlContent; // [oracle]
}
