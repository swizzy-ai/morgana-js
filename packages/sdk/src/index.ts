/**
 * @morgana/sdk — the Morgana framework developer interface.
 *
 * Types-first: actions never import this at runtime. Handlers stay plain
 * `export async function handle(ctx)`; typing is additive via optional
 * `Contract` type exports read statically by the registry generator.
 */

// Contracts + generated registry globals
export type {
  ActionContract,
  ActionName,
  AppEventName,
  AppEventPayload,
  ActionInput,
  ActionOutput,
  RunOptions,
  EventScope,
} from './contracts'

// Families
export type { Family } from './families'
export { FAMILY_ALIASES, resolveFamily, familyAliases } from './families'

// Event catalog
export {
  INTERACTION_EVENTS,
  FRONTEND_EVENTS,
  SYSTEM_EVENTS,
  BACKEND_EVENTS,
} from './events'
export type {
  InteractionEvent,
  StoreFrameEvent,
  DataEvent,
  SystemEvent,
  EventName,
  EventApi,
  EventChannelsSurface,
  ChannelCreateOptions,
  ChannelPermissionCheck,
  ChannelVerdict,
  EventFrame,
  EventGrant,
  EventGrantRequest,
  EventSubscribeOptions,
} from './events'

// Trackables catalog — curated per-handle & backend events in WSC environment
export {
  BUTTON_TRACKABLE_EVENTS,
  INPUT_TRACKABLE_EVENTS,
  PAGE_TRACKABLE_EVENTS,
  LIST_TRACKABLE_EVENTS,
  CHART_TRACKABLE_EVENTS,
  LINK_TRACKABLE_EVENTS,
  TEXT_TRACKABLE_EVENTS,
  BOX_TRACKABLE_EVENTS,
  BACKEND_TRACKABLE_EVENTS,
  COMMON_OBJECT_TRACKABLE_EVENTS,
  TRACKABLES_BY_HANDLE,
  BACKEND_TRACKABLES,
  getTrackablesForHandle,
  getAllTrackablesGuide,
} from './trackables'
export type {
  ButtonTrackableEvent,
  InputTrackableEvent,
  PageTrackableEvent,
  ListTrackableEvent,
  ChartTrackableEvent,
  LinkTrackableEvent,
  TextTrackableEvent,
  BoxTrackableEvent,
  BackendTrackableEvent,
  CommonObjectTrackableEvent,
  ElementTrackableEvent,
  HandleTrackableEventMap,
  TrackableLane,
  TrackableDescriptor,
  HandleTrackablesGuide,
} from './trackables'

// Guards
export type { GuardSpec } from './guards'
export { ROLE_RANKS, STEM_BIND, STEM_GUARD } from './guards'

// Apps — project-level app objects; pages attach by name
export type { AppPage, AppHandle, AppsHandle } from './apps'

// Object handles
export type {
  Placement,
  Resolver,
  ObjectLookup,
  CloneOptions,
  EventSource,
  TrackOptions,
  WhenSource,
  EventHandler,
  Unsubscribe,
  AnyProps,
  MakeToken,
  ObjectHandle,
  BreakpointsApi,
  BoxHandle,
  TextHandle,
  ButtonHandle,
  InputHandle,
  ImageHandle,
  LinkHandle,
  ListHandle,
  PageHandle,
  ChartHandle,
  ChartKind,
  ChartRendererKind,
  ChartStateView,
  TableHandle,
  DialogHandle,
  SelectHandle,
  TabsHandle,
  BadgeHandle,
  AlertHandle,
  ToggleHandle,
  FormHandle,
  ProgressHandle,
  BindShape,
  DomainStoreApi,
  TransformerConfigApi,
} from './handles'

// Object prop types — airtight per-family prop maps
export type {
  SharedProps,
  BoxProps,
  TextProps,
  ButtonProps,
  InputProps,
  ImageProps,
  LinkProps,
  PageProps,
  TableProps,
  TableColumn,
  TableDensity,
  TableVariant,
  TablePaginationConfig,
  TableSortConfig,
  TableFilterConfig,
  TableSelectionConfig,
  DialogProps,
  SelectProps,
  SelectOption,
  TabsProps,
  TabsItem,
  TabsVariant,
  TabsOrientation,
  BadgeProps,
  AlertProps,
  ToggleProps,
  FormProps,
  ProgressProps,
  LayoutToken,
  AlignToken,
  JustifyToken,
  SurfaceToken,
  RadiusToken,
  InputTypeToken,
  ButtonVariant,
  LinkTarget,
  PageViewport,
  TextAlignToken,
  KnownObjectHandleProps,
  BreakpointShape,
} from './props'

// Layout vocabulary — declarative placement & measurement (no raw CSS)
export type {
  Dim,
  SizeMode,
  PlacementMode,
  AnchorToken,
  OverflowToken,
  MeasureApi,
  MeasureExpr,
  GridSpec,
  GridFlow,
} from './layout'
export {
  SIZE_MODES,
  PLACEMENT_MODES,
  ANCHORS,
  OVERFLOW_MODES,
  GRID_FLOWS,
  dim,
} from './layout'

// Token vocabularies (runtime — the engine bridge test checks these against
// the engine's PropSchema so the two stay in lockstep).
export {
  LAYOUT_TOKENS,
  ALIGN_TOKENS,
  JUSTIFY_TOKENS,
  SURFACE_TOKENS,
  RADIUS_TOKENS,
  INPUT_TYPES,
  BUTTON_VARIANTS,
  LINK_TARGETS,
  PAGE_VIEWPORTS,
  TEXT_ALIGNS,
} from './props'

// Icons — the named icon vocabulary (ctx.ui.icons)
export type { IconDef, IconLibraryRef, IconsApi } from './icons'

// Base + server lane — the clean shared base and `ctx.server`
export type {
  BaseContext,
  VarsHandle,
} from './contexts/base'
export type {
  ServerRequest,
  ServerResponseInput,
  ServerApi,
  ServerContext,
  StoreColumnDef,
  StoreShape,
  StoreQueryOptions,
  StoreQueryResult,
  CollectionsHandle,
  FilesHandle,
  FileMeta,
  EventChannelsHandle,
  EventHandle,
  AssetsHandle,
  AuthUser,
  AuthHandle,
  AiHandle,
  ActionsHandle,
  EmitHandle,
  LogHandle,
} from './contexts/server'

// Client lane — the page's UI surface
export type {
  StateHandle,
  UiApi,
  DomElementHandle,
  DomApi,
  PageApi,
  PageAccessor,
  PagesApi,
  ClientEventsApi,
  CreateOptions,
  Creatable,
  ClientContext,
  ActionTriggerEvent,
  ObservableEventEntry,
  ListRef,
} from './contexts/client'

// Interface objects & custom handle extensibility
// Custom objects — types Morgana does not ship (a 3D scene, a video player).
export type {
  CustomObjectDefinition,
  CustomObjectDefineContext,
  CustomObjectClientContext,
  CustomObjectRender,
} from './interfaces'
export {
  createCustomObject,
  registerCustomObject,
  getCustomObject,
  getAllCustomObjects,
  isCustomObject,
  clearCustomObjects,
  creatorNameFor,
  // Deprecated aliases, kept so existing component files still import.
  defineInterfaceObject,
  defineObjectHandle,
  registerInterfaceObject,
  getInterfaceObjectDefinition,
  getAllInterfaceObjectDefinitions,
  clearInterfaceObjectDefinitions,
} from './interfaces'

// Data channel + queue handles (engine objects exposed to the SDK)
export type {
  ChannelScope,
  ChannelInfo,
  ChannelHandler,
  QueueItem,
  QueueHandle,
} from './data'

// Agents and tools — the surface on `ctx.ai.agents` / `ctx.ai.tools`.
// Implemented by @morgana/agents, declared here so an author writes against the
// contract rather than against whichever runtime is answering.
export {
  AGENT_EVENTS,
  type AgentDeclaration,
  type AgentHandle,
  type AgentMessage,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentStep,
  type AgentsHandle,
  type ToolCall,
  type ToolDeclaration,
  type ToolHandle,
  type ToolParamSpec,
  type ToolParams,
  type ToolResult,
  type ToolsHandle,
} from './ai-agents'


// Config — the single morgana.config.ts
export type { MorganaConfig, ConfigVars, Hook, ServerApiRoute, ServerApiCors, ServerApiMethod, TransformerConfigChanges, TransformerDomainChanges, AppDefinition, AiProviderConfig } from './config'
export { defineConfig } from './config'

// Action factories — generic/event actions + compile-time actions
export type { ActionConfig, ActionDef } from './actions'
export { defineServerAction, defineClientAction } from './actions'
