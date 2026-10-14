/** @deprecated Use Wizard from './Wizard' — Workflow is an alias. */
export { Wizard as Workflow, createWizard as createWorkflow } from './Wizard'
export type { WizardAiAdapter as WorkflowAiAdapter, WizardOptions as WorkflowOptions } from './Wizard'
export type {
  TextStepOptions,
  SelectStepOptions,
  ObjectStepOptions,
  SchemaStepOptions,
  ComputeStepOptions,
  SubWizardStepOptions,
  ClassifyStepOptions,
  RouterStepOptions,
} from './Wizard'
