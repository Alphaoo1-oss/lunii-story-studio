// Crée le projet de référence des tests dans le dossier de données, pour essayer l'export
// depuis l'interface avant que la création d'histoires soit disponible.
import { ProjectStore } from "../src/server/storage/projects";
import { createReferenceProject } from "../tests/fixtures/media";

const store = new ProjectStore(process.env.DATA_DIR ?? "./data");
const project = await createReferenceProject(store);
console.log(`Projet de référence créé : http://127.0.0.1:5173/projets/${project.id}/export`);
