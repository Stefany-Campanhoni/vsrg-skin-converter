import type { SkinReader } from "../../../application/ports/skin-reader.ts"
import type { Diagnostic } from "../../../domain/diagnostics.ts"
import type { PlayfieldConfiguration, SkinModel, SkinReference } from "../../../domain/skin.ts"
import { loadNoteSkinContext, type NoteSkinContext } from "../noteskin/note-skin-context.ts"
import { analyzeEtternaNotes, type EtternaNoteAnalysis } from "../noteskin/notes/analyze-notes.ts"
import {
  analyzeEtternaReceptors,
  type EtternaReceptorAnalysis,
} from "../noteskin/receptors/analyze-receptors.ts"
import { readEtternaProfile } from "../profile/read-etterna-profile.ts"

export interface EtternaSkinReaderDependencies {
  readProfile(gameRoot: string): Promise<PlayfieldConfiguration>
  loadNoteSkinContext(skinDirectory: string): Promise<NoteSkinContext>
  analyzeReceptors(context: NoteSkinContext): Promise<EtternaReceptorAnalysis>
  analyzeNotes(context: NoteSkinContext): Promise<EtternaNoteAnalysis>
}

const defaultDependencies: EtternaSkinReaderDependencies = {
  readProfile: readEtternaProfile,
  loadNoteSkinContext,
  analyzeReceptors: analyzeEtternaReceptors,
  analyzeNotes: analyzeEtternaNotes,
}

export class EtternaSkinReader implements SkinReader {
  readonly game = "etterna"
  readonly #dependencies: EtternaSkinReaderDependencies

  constructor(dependencies: EtternaSkinReaderDependencies = defaultDependencies) {
    this.#dependencies = dependencies
  }

  async readSkin(reference: SkinReference): Promise<SkinModel> {
    if (reference.game !== this.game) {
      throw new Error(`Etterna reader cannot read a ${reference.game} skin`)
    }

    const [playfield, context] = await Promise.all([
      this.#dependencies.readProfile(reference.gameRoot),
      this.#dependencies.loadNoteSkinContext(reference.sourcePath),
    ])
    const [receptorAnalysis, noteAnalysis] = await Promise.all([
      this.#dependencies.analyzeReceptors(context),
      this.#dependencies.analyzeNotes(context),
    ])
    const diagnostics: Diagnostic[] = [...receptorAnalysis.diagnostics, ...noteAnalysis.diagnostics]

    return {
      game: this.game,
      metadata: { name: reference.name },
      playfield,
      assets: {
        receptors: receptorAnalysis.receptors,
        tapNotes: noteAnalysis.notes,
      },
      diagnostics,
    }
  }
}
