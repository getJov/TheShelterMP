/**
 * Semantic icon registry — Hugeicons Free.
 *
 * Features import the SEMANTIC name from here, never the raw package.
 * That way a swap ("actually, use a different glyph for burials") is a
 * one-line change instead of a grep across twelve features.
 */
export {
  // navigation
  MapsIcon as IconMap,
  DashboardSquare01Icon as IconDashboard,
  MoneyBag02Icon as IconSales,
  Calendar03Icon as IconBurials,
  UserGroupIcon as IconAgents,
  CheckmarkCircle02Icon as IconApprovals,
  Tag01Icon as IconPricing,
  LayersLogoIcon as IconMapEditor,
  Task01Icon as IconAudit,

  // chrome
  Notification01Icon as IconBell,
  Sun01Icon as IconSun,
  Moon02Icon as IconMoon,
  Settings02Icon as IconSettings,
  Menu01Icon as IconMenu,
  SidebarLeft01Icon as IconSidebar,
  Logout01Icon as IconLogout,
  UserIcon as IconUser,
  Search02Icon as IconSearch,
  FilterIcon as IconFilter,
  MoreVerticalIcon as IconMore,
  FullScreenIcon as IconExpand,
  ArrowShrinkIcon as IconCollapse,
  Cancel02Icon as IconClose,
  RefreshIcon as IconRefresh,

  // domain
  Location01Icon as IconLot,
  Building01Icon as IconLocation,
  GridViewIcon as IconBlock,
  Image01Icon as IconOverlay,
  Wallet01Icon as IconPayment,
  Invoice01Icon as IconInvoice,
  Certificate01Icon as IconCertificate,
  Coins01Icon as IconTrustFund,
  PercentIcon as IconCommission,
  Calculator01Icon as IconCalculator,
  Award01Icon as IconLeaderboard,
  Target02Icon as IconTarget,
  HierarchySquare01Icon as IconHierarchy,
  CheckListIcon as IconGroundsJob,
  File01Icon as IconDocument,
  Archive02Icon as IconArchive,
  UserAdd01Icon as IconAddAgent,

  // actions
  PlusSignIcon as IconAdd,
  PencilEdit01Icon as IconEdit,
  Edit02Icon as IconEditAlt,
  Delete02Icon as IconDelete,
  Copy01Icon as IconCopy,
  Link01Icon as IconLink,
  Download01Icon as IconDownload,
  Upload01Icon as IconUpload,
  PrinterIcon as IconPrint,
  ArrowTurnBackwardIcon as IconUndo,
  Rotate01Icon as IconRotate,
  Move01Icon as IconMove,
  CursorPointer01Icon as IconSelect,
  SquareIcon as IconDrawBlock,

  // feedback
  Alert01Icon as IconWarning,
  InformationCircleIcon as IconInfo,
  Clock01Icon as IconClock,
  Flag01Icon as IconFlag,
  EyeIcon as IconVisible,
  ViewOffIcon as IconHidden,
  ChartLineData01Icon as IconChart,
  AnalyticsUpIcon as IconTrendUp,
  Mail01Icon as IconMail,
  Call02Icon as IconPhone,

  // sales & payments (spec 08)
  Agreement01Icon as IconContract,
  ArrowDataTransferHorizontalIcon as IconTransfer,
  UserMultiple02Icon as IconClients,
  LockIcon as IconHold,
  ReceiptDollarIcon as IconReceipt,
  Money01Icon as IconCash,
  CreditCardIcon as IconBank,
  SmartPhone01Icon as IconMobile,
  Note01Icon as IconCheque,
  Tick02Icon as IconCheck,
  MinusSignIcon as IconMissing,
  ArrowRight01Icon as IconChevronRight,
  ArrowLeft01Icon as IconChevronLeft,
  ArrowDown01Icon as IconSelectorDown,
  StarIcon as IconStar,

  // agents, commissions & payouts (spec 11)
  Alert02Icon as IconAlert,
  Calendar01Icon as IconCalendar,
  ArrowDown01Icon as IconChevronDown,
  ArrowUp01Icon as IconChevronUp,
  ListViewIcon as IconListView,
  MoneyReceive01Icon as IconPayout,
  ChampionIcon as IconTrophy,
  UserSharingIcon as IconUpline,
  GiftIcon as IconIncentive,
  CheckmarkBadge01Icon as IconVerified,

  // pricing & tiers (spec 09)
  TimeQuarterPassIcon as IconHistory,
  PaintBoardIcon as IconAppearance,
  RulerIcon as IconRuler,
  ServiceIcon as IconService,
  DiscountTag01Icon as IconPromo,
  Package01Icon as IconInventory,
  DragDropVerticalIcon as IconDragHandle,

  // dashboard panel (spec 07)
  ArrowUpRight01Icon as IconDeltaUp,
  ArrowDownRight01Icon as IconDeltaDown,
  AnalyticsDownIcon as IconTrendDown,
  ArrowRight02Icon as IconArrowRight,

  // burials & grounds (spec 12)
  CalendarAdd01Icon as IconScheduleBurial,
  SunriseIcon as IconMorning,
  SunsetIcon as IconAfternoon,
  ShovelIcon as IconGrounds,
  Camera01Icon as IconPhoto,
  UserCheck01Icon as IconAssign,
  SignatureIcon as IconSignature,

  // lot detail drawer (spec 06)
  BlockedIcon as IconUnavailable,
  FlowerIcon as IconInterment,
  IdentityCardIcon as IconIdentity,

  // map core (spec 05)
  Satellite02Icon as IconSatellite,
  Layers01Icon as IconLayers,
  SlidersHorizontalIcon as IconSliders,
  Home01Icon as IconHome,
  FitToScreenIcon as IconFitBounds,
  Compass01Icon as IconCompass,

  // map & overlay editor (spec 10)
  GridIcon as IconGrid,
  PenTool01Icon as IconPen,
  ArrowTurnForwardIcon as IconRedo,
  CloudUploadIcon as IconPublish,
  ImageUploadIcon as IconImageUpload,
  MagicWand01Icon as IconAutoFit,
  ResizeFieldIcon as IconResize,
  TextNumberSignIcon as IconNumbering,
  Wrench01Icon as IconRepair,
  LayerAddIcon as IconSendBehind,
  SquareArrowUp01Icon as IconBringFront,
} from '@hugeicons/core-free-icons'

export type { IconSvgElement } from '@hugeicons/react'
