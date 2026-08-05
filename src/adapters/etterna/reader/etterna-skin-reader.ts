import type { SkinReader } from "../../../application/ports/skin-reader.ts"
import type { Diagnostic } from "../../../domain/diagnostics.ts"
import type { PlayfieldConfiguration, SkinModel, SkinReference } from "../../../domain/skin.ts"
import { invokeAsPromise, settleAll } from "../../../infrastructure/async/settle-all.ts"
import {
  type EtternaJudgementAnalysis,
  readEtternaJudgements,
} from "../judgements/read-etterna-judgements.ts"
import { loadNoteSkinContext, type NoteSkinContext } from "../noteskin/note-skin-context.ts"
import { analyzeEtternaNotes, type EtternaNoteAnalysis } from "../noteskin/notes/analyze-notes.ts"
import {
  analyzeEtternaReceptors,
  type EtternaReceptorAnalysis,
} from "../noteskin/receptors/analyze-receptors.ts"
import { readEtternaProfile } from "../profile/read-etterna-profile.ts"

export interface EtternaSkinReaderDependencies {
  readProfile(gameRoot: string, profileId: string, theme: string): Promise<PlayfieldConfiguration>
  loadNoteSkinContext(skinDirectory: string): Promise<NoteSkinContext>
  analyzeReceptors(context: NoteSkinContext): Promise<EtternaReceptorAnalysis>
  analyzeNotes(context: NoteSkinContext): Promise<EtternaNoteAnalysis>
  analyzeJudgements(
    gameRoot: string,
    profileId: string,
    theme: string,
  ): Promise<EtternaJudgementAnalysis>
}

export interface EtternaSkinReaderConfiguration {
  readonly profileId: string
  readonly theme: string
}

const defaultDependencies: EtternaSkinReaderDependencies = {
  readProfile: readEtternaProfile,
  loadNoteSkinContext,
  analyzeReceptors: analyzeEtternaReceptors,
  analyzeNotes: analyzeEtternaNotes,
  analyzeJudgements: readEtternaJudgements,
}

export class EtternaSkinReader implements SkinReader {
  readonly game = "etterna"
  readonly #profileId: string
  readonly #theme: string
  readonly #dependencies: EtternaSkinReaderDependencies

  constructor(
    configuration: EtternaSkinReaderConfiguration,
    dependencies: EtternaSkinReaderDependencies = defaultDependencies,
  ) {
    this.#profileId = configuration.profileId
    this.#theme = configuration.theme
    this.#dependencies = dependencies
  }

  async readSkin(reference: SkinReference): Promise<SkinModel> {
    if (reference.game !== this.game) {
      throw new Error(`Etterna reader cannot read a ${reference.game} skin`)
    }

    const [playfield, context, judgementAnalysis] = await settleAll([
      invokeAsPromise(() =>
        this.#dependencies.readProfile(reference.gameRoot, this.#profileId, this.#theme),
      ),
      invokeAsPromise(() => this.#dependencies.loadNoteSkinContext(reference.sourcePath)),
      invokeAsPromise(() =>
        this.#dependencies.analyzeJudgements(reference.gameRoot, this.#profileId, this.#theme),
      ),
    ])
    const [receptorAnalysis, noteAnalysis] = await settleAll([
      invokeAsPromise(() => this.#dependencies.analyzeReceptors(context)),
      invokeAsPromise(() => this.#dependencies.analyzeNotes(context)),
    ])
    const diagnostics: Diagnostic[] = [
      ...receptorAnalysis.diagnostics,
      ...noteAnalysis.diagnostics,
      ...judgementAnalysis.diagnostics,
    ]

    return {
      game: this.game,
      metadata: { name: reference.name },
      playfield,
      assets: {
        receptors: receptorAnalysis.receptors,
        tapNotes: noteAnalysis.notes,
        judgements: judgementAnalysis.judgements,
      },
      diagnostics,
    }
  }
}
