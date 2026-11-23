import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Order, OrderItem, Product, Shop, User } from '../types';
import { api } from '../services/api';
import { hasPermission } from '../utils/permissions';
import { matchesSearch } from '../utils/searchMatch';
import { useLanguage } from '../i18n/LanguageContext';
import { compressOrderPhoto } from '../utils/imageCompression';
import {
  formatPackStock,
  getPackSize,
  getPackUnitLabel,
  getRetailUnitLabel,
  isPackProduct
} from '../utils/unitConversion';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Eye,
  FileImage,
  Flag,
  History,
  Image as ImageIcon,
  Lock,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UserCheck,
  Warehouse,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface StrictChainWorkspaceProps {
  user: User | null;
  shop: Shop | null;
  onDataChanged?: () => void;
  onToast?: (msg: string) => void;
}

type ChainQueueTab =
  | 'new_order'
  | 'returned'
  | 'supervisor_1'
  | 'shop_release'
  | 'warehouse'
  | 'supervisor_2'
  | 'manager_resolve'
  | 'history';

interface DraftCartItem {
  product: Product;
  sale_mode: 'retail' | 'pack';
  quantity: number;
}

interface ManagerEditRow {
  product_id: number;
  product_name: string;
  sold_unit: string;
  sale_mode: 'retail' | 'pack';
  quantity: number;
  leg_type: 'shop' | 'warehouse';
}

export const StrictChainWorkspace: React.FC<StrictChainWorkspaceProps> = ({
  user,
  shop,
  onDataChanged,
  onToast
}) => {
  const { tf } = useLanguage();

  const canCreateOrders = hasPermission(user, 'can_create_orders');
  const canReleaseStock = hasPermission(user, 'can_release_stock');
  const canVerifyOrders = hasPermission(user, 'can_verify_orders');
  const canResolveFlagged = hasPermission(user, 'can_resolve_flagged_orders');
  const canUploadPhotos = hasPermission(user, 'can_upload_photos');

  const isWarehouseOnly =
    canReleaseStock && !canCreateOrders && !canVerifyOrders && !canResolveFlagged;

  const defaultTab: ChainQueueTab = useMemo(() => {
    if (canResolveFlagged) return 'manager_resolve';
    if (canVerifyOrders && !canCreateOrders) return 'supervisor_1';
    if (isWarehouseOnly) return 'warehouse';
    if (canCreateOrders) return 'new_order';
    if (canVerifyOrders) return 'supervisor_1';
    if (canReleaseStock) return 'warehouse';
    return 'history';
  }, [canCreateOrders, canReleaseStock, canVerifyOrders, canResolveFlagged, isWarehouseOnly]);

  const [activeTab, setActiveTab] = useState<ChainQueueTab>(defaultTab);
  const [products, setProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [warehouseOrders, setWarehouseOrders] = useState<Order[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [r2Configured, setR2Configured] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyActionId, setBusyActionId] = useState<number | null>(null);
  const [errorBanner, setErrorBanner] = useState<string>('');

  // New Order State
  const [productSearch, setProductSearch] = useState('');
  const [depotFilter, setDepotFilter] = useState<'all' | 'shop' | 'warehouse'>('all');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [cart, setCart] = useState<DraftCartItem[]>([]);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const isPhotoMandatory = Boolean(Number(shop?.require_order_photo));

  // Photo capture & compression state
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoMetrics, setPhotoMetrics] = useState<{
    originalBytes: number;
    compressedBytes: number;
    type: string;
  } | null>(null);
  const [compressingPhoto, setCompressingPhoto] = useState(false);

  // Returned Order Edit Modal State
  const [editingReturnedOrder, setEditingReturnedOrder] = useState<Order | null>(null);
  const [returnedDraftItems, setReturnedDraftItems] = useState<
    { product_id: number; product_name: string; sold_unit: string; sale_mode: 'retail' | 'pack'; quantity: number }[]
  >([]);
  const [returnedNotes, setReturnedNotes] = useState('');
  const [returnedAddProductId, setReturnedAddProductId] = useState<string>('');
  const [returnedPhotoFile, setReturnedPhotoFile] = useState<File | null>(null);
  const [returnedPhotoPreview, setReturnedPhotoPreview] = useState<string | null>(null);

  // Action Modals (Return / Flag / Override / Manager Resolve)
  const [returnTargetOrder, setReturnTargetOrder] = useState<Order | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const [flagTargetOrder, setFlagTargetOrder] = useState<Order | null>(null);
  const [flagReason, setFlagReason] = useState('');

  const [overrideTargetOrder, setOverrideTargetOrder] = useState<Order | null>(null);
  const [overrideLeg, setOverrideLeg] = useState<'shop' | 'warehouse' | undefined>(undefined);
  const [overrideReason, setOverrideReason] = useState('');

  const [managerTargetOrder, setManagerTargetOrder] = useState<Order | null>(null);
  const [managerAction, setManagerAction] = useState<
    'edit_and_release' | 'approve_as_is' | 'reassign_supervisor' | 'cancel'
  >('edit_and_release');
  const [managerNote, setManagerNote] = useState('');
  const [managerReassignSupId, setManagerReassignSupId] = useState<string>('');
  const [managerEditRows, setManagerEditRows] = useState<ManagerEditRow[]>([]);
  const [managerAddProductId, setManagerAddProductId] = useState<string>('');

  // Signed Handwritten Photo Viewer Modal
  const [photoModalOrder, setPhotoModalOrder] = useState<Order | null>(null);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [photoModalLoading, setPhotoModalLoading] = useState(false);
  const [photoModalError, setPhotoModalError] = useState('');
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoRotate, setPhotoRotate] = useState(0);

  // History filter
  const [historySearch, setHistorySearch] = useState('');

  const notify = (msg: string) => {
    if (onToast) onToast(msg);
  };

  const loadWorkspaceData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setErrorBanner('');

      const tasks: Promise<any>[] = [
        api.chain.getR2Status().catch(() => ({ configured: false })),
        api.chain.getProductsAvailability(),
        api.chain.getOrders('all')
      ];

      if (canReleaseStock) {
        tasks.push(api.chain.getOrders('warehouse_release'));
      }
      if (canResolveFlagged) {
        tasks.push(api.getUsers().catch(() => ({ users: [] })));
      }

      const results = await Promise.all(tasks);
      setR2Configured(Boolean(results[0]?.configured));
      setProducts(results[1]?.products || []);
      setAllOrders(results[2]?.orders || []);

      let idx = 3;
      if (canReleaseStock) {
        setWarehouseOrders(results[idx]?.orders || []);
        idx++;
      }
      if (canResolveFlagged) {
        setStaffUsers(results[idx]?.users || []);
      }
    } catch (err: any) {
      setErrorBanner(
        err?.message ||
          tf('Failed to load verification chain workspace.', 'Ntibyakunze gufungura urutonde rw’igenzura.')
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && shop?.workflow_mode === 'strict_chain') {
      loadWorkspaceData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, shop?.id, shop?.workflow_mode]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      if (returnedPhotoPreview) URL.revokeObjectURL(returnedPhotoPreview);
    };
  }, [photoPreviewUrl, returnedPhotoPreview]);

  // Derived queues
  const returnedOrders = useMemo(
    () => allOrders.filter((o) => o.chain_status === 'returned_to_seller'),
    [allOrders]
  );
  const supervisor1Orders = useMemo(
    () => allOrders.filter((o) => o.chain_status === 'pending_supervisor_1'),
    [allOrders]
  );
  const shopReleaseOrders = useMemo(
    () =>
      allOrders.filter(
        (o) =>
          o.chain_status === 'in_release' &&
          (o.items || []).some((it) => it.leg_type === 'shop' && it.leg_status === 'pending')
      ),
    [allOrders]
  );
  const pendingWarehouseCount = useMemo(
    () =>
      warehouseOrders.filter((o) =>
        (o.items || []).some((it) => it.leg_type === 'warehouse' && it.leg_status === 'pending')
      ).length,
    [warehouseOrders]
  );
  const supervisor2Orders = useMemo(
    () => allOrders.filter((o) => o.chain_status === 'in_release'),
    [allOrders]
  );
  const flaggedOrders = useMemo(
    () => allOrders.filter((o) => o.chain_status === 'flagged_for_manager'),
    [allOrders]
  );
  const historyOrders = useMemo(() => {
    const base = allOrders.filter(
      (o) => o.chain_status === 'completed' || o.chain_status === 'cancelled'
    );
    if (!historySearch.trim()) return base;
    return base.filter((o) =>
      matchesSearch(
        historySearch,
        o.order_number,
        o.customer_name,
        o.salesperson_name,
        o.first_verified_by_name,
        o.final_verified_by_name
      )
    );
  }, [allOrders, historySearch]);

  const activeSupervisors = useMemo(
    () =>
      staffUsers.filter(
        (u) =>
          Number(u.is_active) === 1 &&
          (u.role === 'manager' || Boolean(u.can_verify_orders))
      ),
    [staffUsers]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const legType = (p as any).leg_type === 'warehouse' ? 'warehouse' : 'shop';
      if (depotFilter !== 'all' && legType !== depotFilter) return false;
      return matchesSearch(productSearch, p.name, p.sku, p.category, p.stock_name);
    });
  }, [products, productSearch, depotFilter]);

  const formatKb = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const handleSelectPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setCompressingPhoto(true);
      setErrorBanner('');
      const result = await compressOrderPhoto(file);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      const url = URL.createObjectURL(result.blob);
      setPhotoFile(file);
      setPhotoPreviewUrl(url);
      setPhotoMetrics({
        originalBytes: result.originalBytes,
        compressedBytes: result.compressedBytes,
        type: result.contentType
      });
    } catch (err: any) {
      setErrorBanner(
        err?.message || tf('Could not read or compress selected photo.', 'Ntibyakunze gufata iyi foto.')
      );
    } finally {
      setCompressingPhoto(false);
    }
  };

  const clearDraftPhoto = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoMetrics(null);
  };

  const addToCart = (product: Product, mode: 'retail' | 'pack') => {
    const packSize = isPackProduct(product) ? getPackSize(product) : 1;
    const availableBase = Math.max(0, Number(product.available_quantity ?? product.quantity ?? 0));
    const stepBase = mode === 'pack' ? packSize : 1;

    setCart((prev) => {
      const usedBaseForProduct = prev
        .filter((c) => c.product.id === product.id)
        .reduce((s, c) => s + c.quantity * (c.sale_mode === 'pack' ? packSize : 1), 0);

      if (usedBaseForProduct + stepBase > availableBase) {
        setErrorBanner(
          tf(
            `Not enough available unreserved stock for "${product.name}".`,
            `Nta bubiko buhagije busigaye bwa "${product.name}".`
          )
        );
        return prev;
      }

      const idx = prev.findIndex((c) => c.product.id === product.id && c.sale_mode === mode);
      if (idx >= 0) {
        return prev.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { product, sale_mode: mode, quantity: 1 }];
    });
  };

  const updateCartQty = (index: number, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setCart((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const prod = target.product;
      const packSize = isPackProduct(prod) ? getPackSize(prod) : 1;
      const availableBase = Math.max(0, Number(prod.available_quantity ?? prod.quantity ?? 0));
      const otherBase = prev
        .filter((_, i) => i !== index && prev[i].product.id === prod.id)
        .reduce((s, c) => s + c.quantity * (c.sale_mode === 'pack' ? packSize : 1), 0);
      const targetMult = target.sale_mode === 'pack' ? packSize : 1;
      const maxAllowed = Math.floor((availableBase - otherBase) / targetMult);
      const clamped = Math.min(Math.max(1, Math.round(nextQty)), Math.max(1, maxAllowed));
      return prev.map((c, i) => (i === index ? { ...c, quantity: clamped } : c));
    });
  };

  const handleSubmitNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      setErrorBanner(tf('Please add at least one item to the order.', 'Nyamuneka shyiramo nibura igicuruzwa kimwe.'));
      return;
    }

    try {
      setSubmittingOrder(true);
      setErrorBanner('');

      if (isPhotoMandatory && !photoFile) {
        setErrorBanner(
          !canUploadPhotos
            ? tf(
                'Store settings require attaching an order photo, and your account needs the Upload Photos duty enabled by your manager.',
                'Amategeko y’iduka asaba ifoto ya komande, kandi umuyobozi akeneye gufungura uburenganzira bw’amafoto kuri konti yawe.'
              )
            : tf(
                'Store settings require attaching a handwritten order photo before submitting.',
                'Amategeko y’iduka asaba kubanza gufotora urupapuro rwa komande mbere yo kohereza.'
              )
        );
        setSubmittingOrder(false);
        return;
      }

      let uploadedKey: string | null = null;
      if (photoFile && canUploadPhotos) {
        if (r2Configured) {
          const uploaded = await api.chain.uploadCompressedOrderPhoto(
            photoFile,
            customerName.trim() || 'order'
          );
          uploadedKey = uploaded.photoKey;
        } else if (isPhotoMandatory) {
          setErrorBanner(
            tf(
              'Order photo upload is required by store settings, but R2 cloud storage is not configured yet.',
              'Ifoto ya komande ni itegeko mu iduka, ariko ububiko bw’amafoto (R2) ntiburashyirwaho.'
            )
          );
          setSubmittingOrder(false);
          return;
        } else {
          notify(
            tf(
              'Order submitted without cloud photo upload because R2 storage is not configured yet.',
              'Komande yoherejwe nta foto kuri R2 kuko R2 itarashyirwaho.'
            )
          );
        }
      }

      const res = await api.chain.createOrder({
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        notes: orderNotes.trim() || undefined,
        handwritten_photo_key: uploadedKey,
        items: cart.map((c) => ({
          product_id: c.product.id,
          quantity: c.quantity,
          sale_mode: c.sale_mode
        }))
      });

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setOrderNotes('');
      clearDraftPhoto();
      notify(
        tf(
          `Order ${res.order?.order_number || ''} sent to Supervisor Verification #1!`,
          `Komande ${res.order?.order_number || ''} yoherejwe ku Mugenzuzi wa 1!`
        )
      );
      await loadWorkspaceData(true);
      onDataChanged?.();
    } catch (err: any) {
      setErrorBanner(err?.message || tf('Failed to submit order.', 'Kohereza komande byanze.'));
    } finally {
      setSubmittingOrder(false);
    }
  };

  const openPhotoViewer = async (order: Order) => {
    setPhotoModalOrder(order);
    setPhotoModalUrl(null);
    setPhotoModalError('');
    setPhotoZoom(1);
    setPhotoRotate(0);

    if (!order.handwritten_photo_key) {
      setPhotoModalError(
        tf('No handwritten slip photo is attached to this order.', 'Nta foto y’urupapuro rwanditseho yometse kuri iyi komande.')
      );
      return;
    }

    try {
      setPhotoModalLoading(true);
      const res = await api.chain.getOrderPhotoViewUrl(order.id);
      setPhotoModalUrl(res.viewUrl);
    } catch (err: any) {
      setPhotoModalError(
        err?.message || tf('Unable to load handwritten slip photo.', 'Ntibyakunze gufungura ifoto y’urupapuro.')
      );
    } finally {
      setPhotoModalLoading(false);
    }
  };

  const handleSupervisor1Approve = async (order: Order) => {
    try {
      setBusyActionId(order.id);
      setErrorBanner('');
      await api.chain.verifyStep1(order.id, 'approve');
      notify(
        tf(
          `Order ${order.order_number} authorized! Locked to you for final Verification #2.`,
          `Komande ${order.order_number} yemejwe! Ni wowe uzayisoza mu Igenzura rya 2.`
        )
      );
      await loadWorkspaceData(true);
      onDataChanged?.();
    } catch (err: any) {
      setErrorBanner(err?.message || tf('Failed to authorize order.', 'Kwemeza komande byanze.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleSupervisor1ReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTargetOrder) return;
    try {
      setBusyActionId(returnTargetOrder.id);
      setErrorBanner('');
      await api.chain.verifyStep1(
        returnTargetOrder.id,
        'return',
        returnReason.trim() || 'Mismatch with handwritten slip — please edit'
      );
      notify(
        tf(
          `Order ${returnTargetOrder.order_number} returned to Seller for editing.`,
          `Komande ${returnTargetOrder.order_number} yasubijwe Umucuruzi ngo ayikosore.`
        )
      );
      setReturnTargetOrder(null);
      setReturnReason('');
      await loadWorkspaceData(true);
      onDataChanged?.();
    } catch (err: any) {
      setErrorBanner(err?.message || tf('Failed to return order.', 'Gusubiza komande byanze.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const openEditReturnedModal = (order: Order) => {
    setEditingReturnedOrder(order);
    setReturnedNotes(order.notes || '');
    setReturnedDraftItems(
      (order.items || []).map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name || `#${it.product_id}`,
        sold_unit: it.sold_unit || it.product_unit || 'pcs',
        sale_mode: it.sale_mode === 'pack' ? 'pack' : 'retail',
        quantity: Number(it.quantity || 1)
      }))
    );
    setReturnedAddProductId('');
    setReturnedPhotoFile(null);
    if (returnedPhotoPreview) URL.revokeObjectURL(returnedPhotoPreview);
    setReturnedPhotoPreview(null);
  };

  const handleSaveReturnedOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReturnedOrder || returnedDraftItems.length === 0) return;

    try {
      setBusyActionId(editingReturnedOrder.id);
      setErrorBanner('');
      let nextPhotoKey: string | undefined;
      if (returnedPhotoFile && r2Configured) {
        const uploaded = await api.chain.uploadCompressedOrderPhoto(
          returnedPhotoFile,
          editingReturnedOrder.order_number
        );
        nextPhotoKey = uploaded.photoKey;
      }

      await api.chain.sellerEditReturnedOrder(editingReturnedOrder.id, {
        notes: returnedNotes.trim() || undefined,
        handwritten_photo_key: nextPhotoKey,
        items: returnedDraftItems.map((it) => ({
          product_id: it.product_id,
          quantity: Math.max(1, Math.round(it.quantity)),
          sale_mode: it.sale_mode
        }))
      });

      notify(
        tf(
          `Order ${editingReturnedOrder.order_number} resubmitted to Supervisor #1!`,
          `Komande ${editingReturnedOrder.order_number} yongeye koherezwa ku Mugenzuzi wa 1!`
        )
      );
      setEditingReturnedOrder(null);
      await loadWorkspaceData(true);
      onDataChanged?.();
    } catch (err: any) {
      setErrorBanner(err?.message || tf('Failed to resubmit order.', 'Kongera kohereza komande byanze.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleReleaseLeg = async (order: Order, leg: 'shop' | 'warehouse') => {
    try {
      setBusyActionId(order.id);
      setErrorBanner('');
      await api.chain.releaseLeg(order.id, leg);
      notify(
        leg === 'warehouse'
          ? tf(
              `Warehouse items released for ${order.order_number}. Sent to Supervisor #2 for final check.`,
              `Ibiri mu bubiko bukuru byasohowe kuri ${order.order_number}. Byoherejwe ku Mugenzuzi wa 2.`
            )
          : tf(
              `Main Shop items marked released for ${order.order_number}. Awaiting Supervisor #2 confirmation.`,
              `Ibiri mu iduka ry’imbere byasohowe kuri ${order.order_number}. Bitegereje Umugenzuzi wa 2.`
            )
      );
      await loadWorkspaceData(true);
      onDataChanged?.();
    } catch (err: any) {
      setErrorBanner(err?.message || tf('Failed to mark items released.', 'Kwandika ko ibicuruzwa byasohotse byanze.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleWarehouseFlagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagTargetOrder || !flagReason.trim()) return;
    try {
      setBusyActionId(flagTargetOrder.id);
      setErrorBanner('');
      await api.chain.flagOrder(flagTargetOrder.id, flagReason.trim());
      notify(
        tf(
          `Order ${flagTargetOrder.order_number} flagged & frozen for Manager resolution.`,
          `Komande ${flagTargetOrder.order_number} yashyizweho ikibazo — itegereje Umuyobozi.`
        )
      );
      setFlagTargetOrder(null);
      setFlagReason('');
      await loadWorkspaceData(true);
      onDataChanged?.();
    } catch (err: any) {
      setErrorBanner(err?.message || tf('Failed to flag order.', 'Kumenyesha ikibazo byanze.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleVerifyStep2 = async (
    order: Order,
    leg?: 'shop' | 'warehouse',
    overrideMsg?: string
  ) => {
    try {
      setBusyActionId(order.id);
      setErrorBanner('');
      const res = await api.chain.verifyStep2(order.id, leg, overrideMsg);
      notify(
        res.completed
          ? tf(
              `Order ${order.order_number} FULLY COMPLETED — physical stock updated!`,
              `Komande ${order.order_number} YARANGIYE NEZA — sitoki yavuguruwe!`
            )
          : tf(
              `Leg confirmed on ${order.order_number}. Waiting for remaining depot release.`,
              `Igice kimwe cyemejwe kuri ${order.order_number}. Hategerejwe ikindi.`
            )
      );
      setOverrideTargetOrder(null);
      setOverrideReason('');
      await loadWorkspaceData(true);
      onDataChanged?.();
    } catch (err: any) {
      setErrorBanner(err?.message || tf('Failed to complete Verification #2.', 'Igenzura rya 2 ryanze.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const openManagerResolveModal = (order: Order) => {
    setManagerTargetOrder(order);
    setManagerAction(order.chain_status === 'flagged_for_manager' ? 'edit_and_release' : 'approve_as_is');
    setManagerNote('');
    setManagerReassignSupId('');
    setManagerAddProductId('');
    setManagerEditRows(
      (order.items || []).map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name || `#${it.product_id}`,
        sold_unit: it.sold_unit || it.product_unit || 'pcs',
        sale_mode: it.sale_mode === 'pack' ? 'pack' : 'retail',
        quantity: Number(it.quantity || 1),
        leg_type: it.leg_type === 'warehouse' ? 'warehouse' : 'shop'
      }))
    );
  };

  const handleManagerResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerTargetOrder) return;

    try {
      setBusyActionId(managerTargetOrder.id);
      setErrorBanner('');
      await api.chain.managerResolve(managerTargetOrder.id, {
        action: managerAction,
        resolution_note: managerNote.trim() || undefined,
        reassign_supervisor_id:
          managerAction === 'reassign_supervisor' ? Number(managerReassignSupId) : undefined,
        items:
          managerAction === 'edit_and_release'
            ? managerEditRows.map((r) => ({
                product_id: r.product_id,
                quantity: Math.max(1, Math.round(r.quantity)),
                sale_mode: r.sale_mode
              }))
            : undefined
      });

      notify(
        tf(
          `Manager action applied to Order ${managerTargetOrder.order_number}.`,
          `Icyemezo cy’Umuyobozi cyashyizwe mu bikorwa kuri Komande ${managerTargetOrder.order_number}.`
        )
      );
      setManagerTargetOrder(null);
      await loadWorkspaceData(true);
      onDataChanged?.();
    } catch (err: any) {
      setErrorBanner(err?.message || tf('Failed to resolve order.', 'Gukemura ikibazo cya komande byanze.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const renderChainStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending_supervisor_1':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {tf('Pending Verify #1', 'Itegereje Igenzura #1')}
          </span>
        );
      case 'returned_to_seller':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
            {tf('Returned to Seller', 'Yasubijwe Umucuruzi')}
          </span>
        );
      case 'in_release':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            {tf('In Physical Release', 'Mu Isohorwa ry’Ibicuruzwa')}
          </span>
        );
      case 'flagged_for_manager':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            {tf('Flagged for Manager', 'Yashyizwe ku Muyobozi')}
          </span>
        );
      case 'completed':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {tf('Completed & Deducted', 'Yarangiye & Yavanywe muri Sitoki')}
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-700 text-slate-300 border border-slate-600">
            {tf('Cancelled', 'Yahagaritswe')}
          </span>
        );
      default:
        return null;
    }
  };

  const renderLegBadge = (item: OrderItem) => {
    const isWh = item.leg_type === 'warehouse';
    const depotLabel = isWh ? tf('Warehouse', 'Ububiko Bukuru') : tf('Main Shop', 'Iduka');
    let statusLabel = tf('Pending Release', 'Irategereje');
    let cls = 'bg-slate-800 text-slate-300 border-slate-700';

    if (item.leg_status === 'seller_released' || item.leg_status === 'warehouse_released') {
      statusLabel = tf('Released — Needs Verify #2', 'Byasohowe — Itegereje #2');
      cls = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    } else if (item.leg_status === 'supervisor_confirmed') {
      statusLabel = tf('Confirmed #2', 'Byemejwe #2');
      cls = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    } else if (item.leg_status === 'flagged') {
      statusLabel = tf('Flagged', 'Bifite Ikibazo');
      cls = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            isWh
              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
              : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
          }`}
        >
          {item.source_stock_name || depotLabel}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
          {statusLabel}
        </span>
      </div>
    );
  };

  const tabs: { id: ChainQueueTab; label: string; count?: number; visible: boolean; urgent?: boolean }[] = [
    {
      id: 'new_order',
      label: tf('New Order', 'Komande Nshya'),
      visible: canCreateOrders
    },
    {
      id: 'returned',
      label: tf('Returned', 'Izasubijwe'),
      count: returnedOrders.length,
      visible: canCreateOrders,
      urgent: returnedOrders.length > 0
    },
    {
      id: 'supervisor_1',
      label: tf('Verify #1', 'Igenzura #1'),
      count: supervisor1Orders.length,
      visible: canVerifyOrders || canResolveFlagged,
      urgent: supervisor1Orders.length > 0
    },
    {
      id: 'shop_release',
      label: tf('Shop Release', 'Isohora mu Iduka'),
      count: shopReleaseOrders.length,
      visible: canCreateOrders || canReleaseStock
    },
    {
      id: 'warehouse',
      label: tf('Warehouse', 'Ububiko Bukuru'),
      count: pendingWarehouseCount,
      visible: canReleaseStock,
      urgent: pendingWarehouseCount > 0
    },
    {
      id: 'supervisor_2',
      label: tf('Verify #2', 'Igenzura #2'),
      count: supervisor2Orders.length,
      visible: canVerifyOrders || canResolveFlagged
    },
    {
      id: 'manager_resolve',
      label: tf('Manager Flags', 'Ibibazo ku Muyobozi'),
      count: flaggedOrders.length,
      visible: canResolveFlagged,
      urgent: flaggedOrders.length > 0
    },
    {
      id: 'history',
      label: tf('Completed', 'Ibyarangiye'),
      count: historyOrders.length,
      visible: true
    }
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4 animate-pulse">
        <div className="h-24 rounded-2xl bg-slate-900/60 border border-slate-800" />
        <div className="h-96 rounded-2xl bg-slate-900/60 border border-slate-800" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-[#121620] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              {tf('Strict Verification & Stock Chain', 'Uruhererekane rw’Igenzura rya Sitoki')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {tf('Stock-Control Only (No Prices)', 'Gucunga Sitoki Gusa (Nta Biciro)')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {tf(
              'Order → Supervisor #1 → Shop & Warehouse Release → Same Supervisor #2 Confirmation → Stock Updated.',
              'Komande → Umugenzuzi #1 → Isohorwa mu Iduka no mu Bubiko → Umugenzuzi #2 → Sitoki Ivugururwa.'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadWorkspaceData(false)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
          <span>{tf('Refresh Queues', 'Vugurura Urutonde')}</span>
        </button>
      </div>

      {!r2Configured && canCreateOrders && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">
              {tf('Cloudflare R2 Storage Not Configured Yet:', 'Ububiko bw’Amafoto (Cloudflare R2) Ntabwo Burashyirwaho:')}
            </span>{' '}
            {tf(
              'Workers can preview & compress handwritten photos locally, and you can add R2 keys on Vercel later for permanent slip archiving.',
              'Abakozi barabona igabanya ry’ingano y’ifoto, kandi uzashyiraho imfunguzo za R2 kuri Vercel nyuma ngo amafoto abikwe.'
            )}
          </div>
        </div>
      )}

      {errorBanner && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-between gap-2 text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-semibold">{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner('')}
            className="text-rose-300 hover:text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Role Queue Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs
          .filter((t) => t.visible)
          .map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                    : tab.urgent
                    ? 'bg-rose-950/30 text-rose-200 border-rose-500/40 hover:bg-rose-950/50'
                    : 'bg-[#121620] text-slate-300 border-slate-800 hover:bg-slate-800/70'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                      isActive
                        ? 'bg-slate-950 text-amber-400'
                        : tab.urgent
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: NEW ORDER (SELLER + PHOTO COMPRESSION + AVAILABLE STOCK)       */}
      {/* ===================================================================== */}
      {activeTab === 'new_order' && canCreateOrders && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Product Picker */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={tf(
                      'Search product name, SKU, or store location...',
                      'Shakisha izina ry’igicuruzwa, kode, cyangwa ububiko...'
                    )}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => setProductSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px]">
                  {[
                    { id: 'all', label: tf('All Depots', 'Ububiko Bwose') },
                    { id: 'shop', label: tf('Main Shop', 'Iduka') },
                    { id: 'warehouse', label: tf('Warehouse', 'Ububiko Bukuru') }
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDepotFilter(d.id as any)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        depotFilter === d.id
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                {filteredProducts.map((p) => {
                  const isWh = (p as any).leg_type === 'warehouse';
                  const available = Math.max(0, Number(p.available_quantity ?? p.quantity ?? 0));
                  const reserved = Math.max(0, Number(p.reserved_quantity ?? 0));
                  const multi = isPackProduct(p);
                  const packSize = getPackSize(p);
                  const packLabel = getPackUnitLabel(p);
                  const retailLabel = getRetailUnitLabel(p);
                  const availBreakdown = formatPackStock(available, p.units_per_pack, p.unit, p.pack_unit);
                  const canAddPack = multi && available >= packSize;

                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white truncate">{p.name}</span>
                          <span className="text-[10px] font-mono text-amber-400">{p.sku}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              isWh
                                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                            }`}
                          >
                            {p.stock_name || (isWh ? tf('Warehouse', 'Ububiko Bukuru') : tf('Main Shop', 'Iduka'))}
                          </span>
                          {Number(p.is_watched) === 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {tf('Monitored', 'Kiragenzurwa')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-mono flex-wrap">
                          <span>
                            {tf('Physical:', 'Mu bubiko:')} <strong className="text-slate-200">{p.quantity}</strong>
                          </span>
                          {reserved > 0 && (
                            <span className="text-amber-300">
                              {tf('Reserved:', 'Bifashwe:')} <strong>{reserved}</strong>
                            </span>
                          )}
                          <span className={available > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {tf('Available:', 'Bisigaye:')}{' '}
                            {multi ? availBreakdown.primary : `${available} ${retailLabel}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {multi ? (
                          <>
                            <button
                              type="button"
                              disabled={!canAddPack}
                              onClick={() => addToCart(p, 'pack')}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-35 text-slate-950 font-bold text-[11px] transition"
                            >
                              +1 {packLabel} (×{packSize})
                            </button>
                            <button
                              type="button"
                              disabled={available <= 0}
                              onClick={() => addToCart(p, 'retail')}
                              className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-35 text-sky-200 border border-sky-500/40 font-bold text-[11px] transition"
                            >
                              +1 {retailLabel}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={available <= 0}
                            onClick={() => addToCart(p, 'retail')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-35 text-slate-950 font-bold text-xs transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{tf('Add', 'Ongeramo')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredProducts.length === 0 && (
                  <div className="py-12 text-center text-xs text-slate-400">
                    {tf('No products match your search.', 'Nta gicuruzwa gihuye n’ibyo ushakisha.')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Handwritten Photo + Order Cart Submission */}
          <form onSubmit={handleSubmitNewOrder} className="lg:col-span-5 space-y-4">
            {/* Handwritten Slip Photo Card (shown when permitted or required by store) */}
            {(canUploadPhotos || isPhotoMandatory) && (
            <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                    <Camera className="w-4 h-4 text-amber-400" />
                    <span>{tf('Handwritten Order Photo', 'Ifoto y’Urupapuro Rwanditseho')}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        isPhotoMandatory
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {isPhotoMandatory ? tf('Required', 'Ni Itegeko') : tf('Optional', 'Si Itegeko')}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {tf(
                      'Silently shrinks ~5 MB phone photos to ~300 KB so supervisors & warehouse can cross-check handwriting.',
                      'Igabanya ingano y’ifoto ikaba ~300 KB kugira ngo abagenzuzi n’abarinzi b’ububiko babone ibyanditswe.'
                    )}
                  </p>
                </div>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handleSelectPhotoFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleSelectPhotoFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />

              {!canUploadPhotos ? (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-200">
                  {tf(
                    'This store requires an order photo. Ask your store manager to enable "Upload Photos" on your account in Staff & Duties.',
                    'Iri duka ritegeka ifoto ya komande. Saba umuyobozi gufungura uburenganzira bw’amafoto kuri konti yawe.'
                  )}
                </div>
              ) : !photoPreviewUrl ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={compressingPhoto}
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{compressingPhoto ? tf('Shrinking...', 'Biragabanywa...') : tf('Take Photo', 'Fata Ifoto')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={compressingPhoto}
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition"
                  >
                    <FileImage className="w-4 h-4 text-sky-400" />
                    <span>{tf('Upload Image', 'Hitamo Ifoto')}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 max-h-52 flex items-center justify-center">
                    <img
                      src={photoPreviewUrl}
                      alt={tf('Handwritten order preview', 'Ifoto y’urupapuro rwa komande')}
                      className="max-h-52 object-contain"
                    />
                    <button
                      type="button"
                      onClick={clearDraftPhoto}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-900/90 hover:bg-rose-600 text-white border border-slate-700 transition"
                      title={tf('Remove photo', 'Kuraho ifoto')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {photoMetrics && (
                    <div className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                      <span>{tf('Ready & Compressed:', 'Yateguwe neza:')}</span>
                      <span>
                        {formatKb(photoMetrics.originalBytes)} &rarr;{' '}
                        <strong>{formatKb(photoMetrics.compressedBytes)}</strong>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Client Info & Cart Items */}
            <div className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <span>{tf('Order Details (Stock Dispatch)', 'Amakuru ya Komande')}</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] text-slate-400 font-semibold">
                    {tf('Client Name (Optional)', 'Izina ry’Umukiriya (Si ngombwa)')}
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={tf('Walk-in Client', 'Umukiriya usanzwe')}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-semibold">
                    {tf('Phone (Optional)', 'Telefoni (Si ngombwa)')}
                  </label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="078..."
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-semibold">
                  {tf('Notes for Supervisor / Store (Optional)', 'Icyitonderwa (Si ngombwa)')}
                </label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder={tf('e.g. Client pickup truck waiting', 'urugero: Imodoka irategereje')}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>{tf('Selected Items', 'Ibicuruzwa Byatoranyijwe')}</span>
                  <span className="font-mono text-amber-400">{cart.length}</span>
                </div>

                {cart.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center bg-slate-900/50 rounded-xl border border-slate-800/80">
                    {tf('Tap products on the left to build the stock order.', 'Kanda ku bicuruzwa ibumoso kugira ngo ukore komande.')}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {cart.map((item, idx) => {
                      const isWh = (item.product as any).leg_type === 'warehouse';
                      const unitLabel =
                        item.sale_mode === 'pack'
                          ? getPackUnitLabel(item.product)
                          : getRetailUnitLabel(item.product);
                      return (
                        <div
                          key={`${item.product.id}-${item.sale_mode}`}
                          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{item.product.name}</p>
                            <p className="text-[10px] text-slate-400">
                              {unitLabel} &bull;{' '}
                              <span className={isWh ? 'text-indigo-300' : 'text-sky-300'}>
                                {item.product.stock_name || (isWh ? 'Warehouse' : 'Main Shop')}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={item.quantity}
                              onChange={(e) => updateCartQty(idx, Number(e.target.value))}
                              className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-center text-white"
                            />
                            <button
                              type="button"
                              onClick={() => updateCartQty(idx, 0)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submittingOrder || cart.length === 0}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition"
              >
                <Send className="w-4 h-4" />
                <span>
                  {submittingOrder
                    ? tf('Uploading & Submitting...', 'Birimo koherezwa...')
                    : tf('Submit for Supervisor #1 Verification', 'Ohereza ku Mugenzuzi wa 1')}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: RETURNED ORDERS (SELLER EDITS & RESUBMITS)                     */}
      {/* ===================================================================== */}
      {activeTab === 'returned' && canCreateOrders && (
        <div className="space-y-3">
          {returnedOrders.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#121620] border border-slate-800 text-center text-xs text-slate-400">
              {tf('No orders returned by supervisors right now.', 'Nta komande zasubijwe n’abagenzuzi zihari ubu.')}
            </div>
          ) : (
            returnedOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-5 rounded-2xl bg-[#121620] border border-orange-500/40 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-black text-amber-400">{ord.order_number}</span>
                      {renderChainStatusBadge(ord.chain_status)}
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {tf('Client:', 'Umukiriya:')} <strong>{ord.customer_name || tf('Walk-in Client', 'Umukiriya usanzwe')}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {ord.handwritten_photo_key && (
                      <button
                        type="button"
                        onClick={() => openPhotoViewer(ord)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 border border-slate-700"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>{tf('View Handwritten Slip', 'Reba Ifoto y’Urupapuro')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditReturnedModal(ord)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{tf('Edit & Resubmit', 'Kosora & Wongere Wohereze')}</span>
                    </button>
                  </div>
                </div>

                {ord.resolution_note && (
                  <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs text-orange-200">
                    <strong>{tf('Supervisor Note:', 'Impamvu y’Umugenzuzi:')}</strong> {ord.resolution_note}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(ord.items || []).map((it) => (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-200 truncate pr-2">{it.product_name}</span>
                      <span className="font-mono font-black text-amber-400 shrink-0">
                        {it.quantity} {it.sold_unit || it.product_unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: SUPERVISOR VERIFICATION #1 (CROSS-CHECK SLIP & AUTHORIZE)      */}
      {/* ===================================================================== */}
      {activeTab === 'supervisor_1' && (canVerifyOrders || canResolveFlagged) && (
        <div className="space-y-4">
          {supervisor1Orders.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#121620] border border-slate-800 text-center text-xs text-slate-400">
              {tf('All orders verified! Nothing waiting for Verification #1.', 'Komande zose zagenzuwe! Nta zitegereje Igenzura #1.')}
            </div>
          ) : (
            supervisor1Orders.map((ord) => (
              <div
                key={ord.id}
                className="p-5 rounded-2xl bg-[#121620] border border-amber-500/30 space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-black text-amber-400">{ord.order_number}</span>
                      {renderChainStatusBadge(ord.chain_status)}
                      {ord.handwritten_photo_key ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {tf('Handwritten Slip Attached', 'Ifoto Yometseho')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          {tf('No Slip Photo', 'Nta Foto')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {tf('Client:', 'Umukiriya:')} <strong className="text-slate-200">{ord.customer_name || tf('Walk-in Client', 'Umukiriya usanzwe')}</strong> &bull;{' '}
                      {tf('Seller:', 'Umucuruzi:')} <strong className="text-slate-200">{ord.salesperson_name}</strong>
                    </p>
                    {ord.notes && (
                      <p className="text-[11px] text-slate-300 mt-1 italic">"{ord.notes}"</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {ord.handwritten_photo_key && (
                      <button
                        type="button"
                        onClick={() => openPhotoViewer(ord)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-300 border border-slate-700"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{tf('Inspect Handwritten Photo', 'Reba Ifoto y’Urupapuro')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyActionId === ord.id}
                      onClick={() => {
                        setReturnTargetOrder(ord);
                        setReturnReason('');
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/40 text-xs font-bold"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{tf('Return to Seller', 'Subiza Umucuruzi')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyActionId === ord.id}
                      onClick={() => handleSupervisor1Approve(ord)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{tf('Authorize Release', 'Emeza Isohorwa')}</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">{tf('Product', 'Igicuruzwa')}</th>
                        <th className="py-2 px-3">{tf('Depot', 'Ububiko')}</th>
                        <th className="py-2 px-3 text-right">{tf('Quantity Requested', 'Ingano Yasabwe')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {(ord.items || []).map((it) => (
                        <tr key={it.id}>
                          <td className="py-2.5 px-3 font-bold text-slate-100">
                            {it.product_name}{' '}
                            <span className="text-[10px] font-mono text-slate-400">({it.product_sku})</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                it.leg_type === 'warehouse'
                                  ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                  : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                              }`}
                            >
                              {it.source_stock_name || (it.leg_type === 'warehouse' ? 'Warehouse' : 'Main Shop')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-amber-400">
                            {it.quantity} {it.sold_unit || it.product_unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: MAIN SHOP RELEASE (SELLER RELEASES SHOP-FLOOR ITEMS)           */}
      {/* ===================================================================== */}
      {activeTab === 'shop_release' && (canCreateOrders || canReleaseStock) && (
        <div className="space-y-4">
          {shopReleaseOrders.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#121620] border border-slate-800 text-center text-xs text-slate-400">
              {tf('No authorized Main Shop items waiting for physical handover.', 'Nta bicuruzwa byo mu iduka ry’imbere bitegereje gutangwa.')}
            </div>
          ) : (
            shopReleaseOrders.map((ord) => {
              const shopItems = (ord.items || []).filter((it) => it.leg_type === 'shop');
              return (
                <div key={ord.id} className="p-5 rounded-2xl bg-[#121620] border border-sky-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-black text-amber-400">{ord.order_number}</span>
                        {renderChainStatusBadge(ord.chain_status)}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {tf('Client:', 'Umukiriya:')} <strong className="text-slate-200">{ord.customer_name}</strong> &bull;{' '}
                        {tf('Authorized by Supervisor #1:', 'Byemejwe n’Umugenzuzi #1:')}{' '}
                        <strong className="text-amber-300">{ord.first_verified_by_name}</strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={busyActionId === ord.id}
                      onClick={() => handleReleaseLeg(ord, 'shop')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs"
                    >
                      <Package className="w-4 h-4" />
                      <span>{tf('Confirm Main Shop Items Released', 'Emeza ko Ibyo mu Iduka Byasohotse')}</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {shopItems.map((it) => (
                      <div
                        key={it.id}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">{it.product_name}</span>
                          <span className="ml-2 text-[10px] text-sky-300">({it.source_stock_name || 'Main Shop'})</span>
                        </div>
                        <span className="font-mono font-black text-amber-400">
                          {it.quantity} {it.sold_unit || it.product_unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: WAREHOUSE QUEUE (ONLY WAREHOUSE ITEMS + RELEASE OR FLAG ONLY)  */}
      {/* ===================================================================== */}
      {activeTab === 'warehouse' && canReleaseStock && (
        <div className="space-y-4">
          {warehouseOrders.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#121620] border border-slate-800 text-center text-xs text-slate-400">
              {tf('No authorized orders requesting items from Warehouse right now.', 'Nta komande zisaba ibicuruzwa mu bubiko bukuru zihari ubu.')}
            </div>
          ) : (
            warehouseOrders.map((ord) => {
              const whItems = ord.items || [];
              const hasPendingWh = whItems.some((it) => it.leg_status === 'pending');

              return (
                <div key={ord.id} className="p-5 rounded-2xl bg-[#121620] border border-indigo-500/40 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Warehouse className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm font-mono font-black text-amber-400">{ord.order_number}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {tf('Warehouse Request Only', 'Ibisabwa mu Bubiko Bukuru Gusa')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {tf('Client:', 'Umukiriya:')} <strong className="text-slate-200">{ord.customer_name}</strong> &bull;{' '}
                        {tf('Authorized by:', 'Byemejwe na:')} <strong className="text-amber-300">{ord.first_verified_by_name}</strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ord.handwritten_photo_key && (
                        <button
                          type="button"
                          onClick={() => openPhotoViewer(ord)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-300 border border-slate-700"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{tf('View Handwritten Slip', 'Reba Ifoto y’Urupapuro')}</span>
                        </button>
                      )}

                      {hasPendingWh && (
                        <>
                          <button
                            type="button"
                            disabled={busyActionId === ord.id}
                            onClick={() => {
                              setFlagTargetOrder(ord);
                              setFlagReason('');
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-bold"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            <span>{tf('Flag Discrepancy', 'Menyesha Ikibazo')}</span>
                          </button>

                          <button
                            type="button"
                            disabled={busyActionId === ord.id}
                            onClick={() => handleReleaseLeg(ord, 'warehouse')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{tf('Release Warehouse Stock', 'Sohora Ibiri mu Bubiko')}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {whItems.map((it) => (
                      <div
                        key={it.id}
                        className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">{it.product_name}</span>
                          <span className="ml-2 text-[10px] font-mono text-slate-400">{it.product_sku}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {renderLegBadge(it)}
                          <span className="font-mono font-black text-amber-400 text-sm">
                            {it.quantity} {it.sold_unit || it.product_unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: SUPERVISOR VERIFICATION #2 (SAME-SUPERVISOR LOCK)              */}
      {/* ===================================================================== */}
      {activeTab === 'supervisor_2' && (canVerifyOrders || canResolveFlagged) && (
        <div className="space-y-4">
          {supervisor2Orders.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#121620] border border-slate-800 text-center text-xs text-slate-400">
              {tf('No orders currently awaiting Verification #2.', 'Nta komande zitegereje Igenzura #2 ubu.')}
            </div>
          ) : (
            supervisor2Orders.map((ord) => {
              const items = ord.items || [];
              const hasReleasedLeg = items.some(
                (it) => it.leg_status === 'seller_released' || it.leg_status === 'warehouse_released'
              );
              const isSameSupervisor = Number(ord.first_verified_by) === Number(user?.id);

              return (
                <div
                  key={ord.id}
                  className={`p-5 rounded-2xl bg-[#121620] border space-y-4 ${
                    isSameSupervisor ? 'border-emerald-500/40' : 'border-slate-800'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-black text-amber-400">{ord.order_number}</span>
                        {renderChainStatusBadge(ord.chain_status)}
                        {isSameSupervisor ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            <span>{tf('Assigned to You (#1 → #2)', 'Ni Wowe Wahiswemo (#1 → #2)')}</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-amber-300 border border-slate-700 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>
                              {tf(
                                `Locked to ${ord.first_verified_by_name || 'Supervisor #1'}`,
                                `Byahariwe ${ord.first_verified_by_name || 'Umugenzuzi #1'}`
                              )}
                            </span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {tf('Client:', 'Umukiriya:')} <strong className="text-slate-200">{ord.customer_name}</strong> &bull;{' '}
                        {tf('Seller:', 'Umucuruzi:')} <strong className="text-slate-200">{ord.salesperson_name}</strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ord.handwritten_photo_key && (
                        <button
                          type="button"
                          onClick={() => openPhotoViewer(ord)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-300 border border-slate-700"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{tf('Slip Photo', 'Ifoto')}</span>
                        </button>
                      )}

                      {hasReleasedLeg && isSameSupervisor && (
                        <button
                          type="button"
                          disabled={busyActionId === ord.id}
                          onClick={() => handleVerifyStep2(ord)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20"
                        >
                          <ClipboardCheck className="w-4 h-4" />
                          <span>{tf('Confirm Final Release (#2)', 'Emeza Isohorwa rya Nyuma (#2)')}</span>
                        </button>
                      )}

                      {hasReleasedLeg && !isSameSupervisor && canResolveFlagged && (
                        <button
                          type="button"
                          onClick={() => {
                            setOverrideTargetOrder(ord);
                            setOverrideLeg(undefined);
                            setOverrideReason('');
                          }}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>{tf('Manager Override Verify', 'Umuyobozi Yemeze mu Mwanya We')}</span>
                        </button>
                      )}

                      {canResolveFlagged && (
                        <button
                          type="button"
                          onClick={() => openManagerResolveModal(ord)}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700"
                        >
                          {tf('Reassign / Manage', 'Simbuza / Gucunga')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {items.map((it) => (
                      <div
                        key={it.id}
                        className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">{it.product_name}</span>
                          {it.leg_released_by_name && (
                            <span className="ml-2 text-[10px] text-slate-400">
                              ({tf('Released by:', 'Yasohowe na:')} {it.leg_released_by_name})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {renderLegBadge(it)}
                          <span className="font-mono font-black text-amber-400">
                            {it.quantity} {it.sold_unit || it.product_unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 7: MANAGER FLAGGED RESOLUTION & REASSIGNMENT                      */}
      {/* ===================================================================== */}
      {activeTab === 'manager_resolve' && canResolveFlagged && (
        <div className="space-y-4">
          {flaggedOrders.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#121620] border border-slate-800 text-center text-xs text-slate-400">
              {tf('No discrepancy flags from warehouse! Everything is running smoothly.', 'Nta bibazo byagaragajwe n’ububiko! Byose biragenda neza.')}
            </div>
          ) : (
            flaggedOrders.map((ord) => (
              <div key={ord.id} className="p-5 rounded-2xl bg-[#121620] border border-rose-500/50 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-black text-amber-400">{ord.order_number}</span>
                      {renderChainStatusBadge(ord.chain_status)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {tf('Client:', 'Umukiriya:')} <strong className="text-slate-200">{ord.customer_name}</strong> &bull;{' '}
                      {tf('Flagged by:', 'Yatanzwe na:')} <strong className="text-rose-300">{ord.flagged_by_name}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {ord.handwritten_photo_key && (
                      <button
                        type="button"
                        onClick={() => openPhotoViewer(ord)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-sky-300 border border-slate-700"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{tf('View Handwritten Slip', 'Reba Ifoto y’Urupapuro')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openManagerResolveModal(ord)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      <span>{tf('Resolve Flag', 'Kemura Ikibazo')}</span>
                    </button>
                  </div>
                </div>

                {ord.flag_reason && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
                    <strong>{tf('Warehouse Flag Reason:', 'Impamvu y’Ububiko:')}</strong> {ord.flag_reason}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(ord.items || []).map((it) => (
                    <div
                      key={it.id}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-200 truncate pr-2">{it.product_name}</span>
                      <span className="font-mono font-black text-amber-400 shrink-0">
                        {it.quantity} {it.sold_unit || it.product_unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 8: COMPLETED & CANCELLED CHAIN HISTORY                            */}
      {/* ===================================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={tf('Search order #, client, seller, or supervisor...', 'Shakisha komande #, umukiriya, umucuruzi...')}
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#121620] border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-3">
            {historyOrders.map((ord) => (
              <div key={ord.id} className="p-4 rounded-2xl bg-[#121620] border border-slate-800 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-black text-amber-400">{ord.order_number}</span>
                      {renderChainStatusBadge(ord.chain_status)}
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(ord.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {tf('Client:', 'Umukiriya:')} <strong>{ord.customer_name || tf('Walk-in Client', 'Umukiriya usanzwe')}</strong> &bull;{' '}
                      {tf('Seller:', 'Umucuruzi:')} <strong>{ord.salesperson_name}</strong> &bull;{' '}
                      {tf('Supervisor #1:', 'Umugenzuzi #1:')} <strong>{ord.first_verified_by_name || '-'}</strong> &bull;{' '}
                      {tf('Final #2:', 'Umugenzuzi #2:')} <strong>{ord.final_verified_by_name || '-'}</strong>
                    </p>
                  </div>

                  {ord.handwritten_photo_key && (
                    <button
                      type="button"
                      onClick={() => openPhotoViewer(ord)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 border border-slate-700 self-start sm:self-auto"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{tf('Slip Photo', 'Ifoto')}</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {(ord.items || []).map((it) => (
                    <div
                      key={it.id}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-200"
                    >
                      <strong>{it.product_name}</strong>: {it.quantity} {it.sold_unit || it.product_unit}{' '}
                      <span className="text-slate-400">({it.source_stock_name || it.leg_type})</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {historyOrders.length === 0 && (
              <div className="p-10 rounded-2xl bg-[#121620] border border-slate-800 text-center text-xs text-slate-400">
                <History className="w-7 h-7 mx-auto mb-2 text-slate-500" />
                {tf('No completed verification chain orders yet.', 'Nta komande zirarangira mu ruhererekane rw’igenzura.')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: INLINE HANDWRITTEN ORDER PHOTO VIEWER                          */}
      {/* ===================================================================== */}
      {photoModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-4xl rounded-2xl bg-[#131722] border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {tf('Handwritten Order Slip', 'Ifoto y’Urupapuro Rwanditseho')} &mdash; {photoModalOrder.order_number}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {photoModalOrder.customer_name || tf('Walk-in Client', 'Umukiriya usanzwe')}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPhotoZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title={tf('Zoom Out', 'Gabanya')}
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title={tf('Zoom In', 'Zamura')}
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoRotate((r) => (r + 90) % 360)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title={tf('Rotate 90°', 'Zengurutsa 90°')}
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoModalOrder(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 overflow-hidden">
              <div className="lg:col-span-2 bg-slate-950 flex items-center justify-center overflow-auto p-4 min-h-[280px]">
                {photoModalLoading ? (
                  <p className="text-xs text-slate-400">{tf('Loading handwritten photo...', 'Ifoto irimo gufungurwa...')}</p>
                ) : photoModalError ? (
                  <p className="text-xs text-rose-300 text-center max-w-sm">{photoModalError}</p>
                ) : photoModalUrl ? (
                  <img
                    src={photoModalUrl}
                    alt={`Handwritten slip ${photoModalOrder.order_number}`}
                    style={{
                      transform: `scale(${photoZoom}) rotate(${photoRotate}deg)`,
                      transformOrigin: 'center center'
                    }}
                    className="max-h-[68vh] object-contain transition-transform duration-150"
                  />
                ) : null}
              </div>

              <div className="p-4 border-t lg:border-t-0 lg:border-l border-slate-800 bg-[#121620] overflow-y-auto space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {tf('System Order Items', 'Ibyanditswe muri Sisitemu')}
                </h4>
                {(photoModalOrder.items || []).map((it) => (
                  <div
                    key={it.id}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-white">{it.product_name}</p>
                      <p className="text-[10px] text-slate-400">{it.source_stock_name || it.leg_type}</p>
                    </div>
                    <span className="font-mono font-black text-amber-400">
                      {it.quantity} {it.sold_unit || it.product_unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: RETURN ORDER TO SELLER                                         */}
      {/* ===================================================================== */}
      {returnTargetOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSupervisor1ReturnSubmit}
            className="w-full max-w-md rounded-2xl bg-[#131722] border border-orange-500/40 p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-white">
              {tf('Return Order to Seller', 'Subiza Komande Umucuruzi')} &mdash; {returnTargetOrder.order_number}
            </h3>
            <div>
              <label className="text-xs font-semibold text-slate-300">
                {tf('Correction Reason *', 'Impamvu yo Gusubiza *')}
              </label>
              <textarea
                required
                rows={3}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder={tf(
                  'e.g. Handwritten slip says 15 cement bags, not 5.',
                  'urugero: Urupapuro rwanditseho imifuka 15 ya sima, si 5.'
                )}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnTargetOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                {tf('Cancel', 'Hagarika')}
              </button>
              <button
                type="submit"
                disabled={busyActionId === returnTargetOrder.id}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs"
              >
                {tf('Return to Seller', 'Subiza Umucuruzi')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: SELLER EDIT RETURNED ORDER                                     */}
      {/* ===================================================================== */}
      {editingReturnedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveReturnedOrder}
            className="w-full max-w-xl rounded-2xl bg-[#131722] border border-slate-700 p-5 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {tf('Edit & Resubmit Order', 'Kosora Komande')} &mdash; {editingReturnedOrder.order_number}
              </h3>
              <button type="button" onClick={() => setEditingReturnedOrder(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {editingReturnedOrder.resolution_note && (
              <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs text-orange-200">
                <strong>{tf('Supervisor Note:', 'Impamvu:')}</strong> {editingReturnedOrder.resolution_note}
              </div>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {returnedDraftItems.map((it, idx) => (
                <div
                  key={`${it.product_id}-${it.sale_mode}-${idx}`}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-bold text-white truncate">{it.product_name} ({it.sold_unit})</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={it.quantity}
                      onChange={(e) => {
                        const val = Math.max(1, Math.round(Number(e.target.value) || 1));
                        setReturnedDraftItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, quantity: val } : row))
                        );
                      }}
                      className="w-20 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-white"
                    />
                    {returnedDraftItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setReturnedDraftItems((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-rose-400 hover:bg-rose-500/10 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={returnedAddProductId}
                onChange={(e) => setReturnedAddProductId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
              >
                <option value="">{tf('+ Add missing product...', '+ Ongeramo ikindi gicuruzwa...')}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.available_quantity ?? p.quantity} {getRetailUnitLabel(p)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!returnedAddProductId}
                onClick={() => {
                  const prod = products.find((p) => p.id === Number(returnedAddProductId));
                  if (!prod) return;
                  setReturnedDraftItems((prev) => [
                    ...prev,
                    {
                      product_id: prod.id,
                      product_name: prod.name,
                      sold_unit: getRetailUnitLabel(prod),
                      sale_mode: 'retail',
                      quantity: 1
                    }
                  ]);
                  setReturnedAddProductId('');
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-amber-300 border border-slate-700"
              >
                {tf('Add', 'Ongeramo')}
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">
                {tf('Replace Slip Photo (Optional)', 'Simbuza Ifoto y’Urupapuro (Si ngombwa)')}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setReturnedPhotoFile(f);
                  if (returnedPhotoPreview) URL.revokeObjectURL(returnedPhotoPreview);
                  setReturnedPhotoPreview(f ? URL.createObjectURL(f) : null);
                }}
                className="block w-full mt-1 text-xs text-slate-300"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">{tf('Notes', 'Inyandiko')}</label>
              <input
                type="text"
                value={returnedNotes}
                onChange={(e) => setReturnedNotes(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingReturnedOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                {tf('Cancel', 'Hagarika')}
              </button>
              <button
                type="submit"
                disabled={busyActionId === editingReturnedOrder.id}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs"
              >
                {tf('Resubmit to Supervisor #1', 'Ongera Wohereze ku Mugenzuzi #1')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: WAREHOUSE FLAG DISCREPANCY                                     */}
      {/* ===================================================================== */}
      {flagTargetOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleWarehouseFlagSubmit}
            className="w-full max-w-md rounded-2xl bg-[#131722] border border-rose-500/40 p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Flag className="w-4 h-4 text-rose-400" />
              <span>{tf('Flag Mismatch for Manager', 'Menyesha Umuyobozi Ikibazo')} &mdash; {flagTargetOrder.order_number}</span>
            </h3>
            <p className="text-xs text-slate-400">
              {tf(
                'This order will freeze until the Manager (or delegated officer) reviews the handwritten slip and resolves it.',
                'Iyi komande irafungwa kugeza Umuyobozi arebye ifoto akabikemura.'
              )}
            </p>
            <div>
              <label className="text-xs font-semibold text-slate-300">
                {tf('Discrepancy Reason *', 'Ikibazo Cyawe *')}
              </label>
              <textarea
                required
                rows={3}
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder={tf(
                  'e.g. Handwritten photo reads 10 cartons, but system says 1 carton.',
                  'urugero: Ku rupapuro handitse amakarito 10 ariko muri sisitemu hari 1.'
                )}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFlagTargetOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                {tf('Cancel', 'Hagarika')}
              </button>
              <button
                type="submit"
                disabled={busyActionId === flagTargetOrder.id}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
              >
                {tf('Freeze & Flag Order', 'Funga & Wohereze ku Muyobozi')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: MANAGER OVERRIDE VERIFY #2                                     */}
      {/* ===================================================================== */}
      {overrideTargetOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!overrideReason.trim()) return;
              handleVerifyStep2(overrideTargetOrder, overrideLeg, overrideReason.trim());
            }}
            className="w-full max-w-md rounded-2xl bg-[#131722] border border-amber-500/40 p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-white">
              {tf('Manager Override Verification #2', 'Igenzura rya 2 ry’Umuyobozi')} &mdash; {overrideTargetOrder.order_number}
            </h3>
            <p className="text-xs text-slate-400">
              {tf(
                `Order was authorized at Step 1 by ${overrideTargetOrder.first_verified_by_name}. Explain why you are completing Step 2 on their behalf.`,
                `Komande yemejwe mbere na ${overrideTargetOrder.first_verified_by_name}. Sobanura impamvu urimo gusoza Igenzura #2.`
              )}
            </p>
            <div>
              <label className="text-xs font-semibold text-slate-300">
                {tf('Override Reason *', 'Impamvu *')}
              </label>
              <input
                type="text"
                required
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={tf('e.g. Supervisor 1 on emergency leave', 'urugero: Umugenzuzi wa 1 yagiye ku kiruhuko')}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverrideTargetOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                {tf('Cancel', 'Hagarika')}
              </button>
              <button
                type="submit"
                disabled={busyActionId === overrideTargetOrder.id}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs"
              >
                {tf('Confirm Final Release', 'Emeza Isohorwa rya Nyuma')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: MANAGER RESOLUTION / EDIT & RELEASE / REASSIGN / CANCEL        */}
      {/* ===================================================================== */}
      {managerTargetOrder && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleManagerResolveSubmit}
            className="w-full max-w-2xl rounded-2xl bg-[#131722] border border-slate-700 p-5 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {tf('Manager Resolution', 'Icyemezo cy’Umuyobozi')} &mdash; {managerTargetOrder.order_number}
              </h3>
              <button type="button" onClick={() => setManagerTargetOrder(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {managerTargetOrder.flag_reason && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
                <strong>{tf('Warehouse Flag Reason:', 'Impamvu y’Ububiko:')}</strong> {managerTargetOrder.flag_reason}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { id: 'edit_and_release', label: tf('Edit & Release', 'Hindura & Usohore') },
                { id: 'approve_as_is', label: tf('Approve As-Is', 'Emeza Uko Biri') },
                { id: 'reassign_supervisor', label: tf('Reassign Supervisor', 'Simbuza Umugenzuzi') },
                { id: 'cancel', label: tf('Cancel Order', 'Hagarika Komande') }
              ].map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => setManagerAction(act.id as any)}
                  className={`py-2 px-2.5 rounded-xl font-bold border transition ${
                    managerAction === act.id
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {act.label}
                </button>
              ))}
            </div>

            {managerAction === 'edit_and_release' && (
              <div className="space-y-3">
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {managerEditRows.map((row, idx) => (
                    <div
                      key={`${row.product_id}-${row.sale_mode}-${idx}`}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-bold text-white truncate">
                        {row.product_name} ({row.sold_unit})
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={row.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, Math.round(Number(e.target.value) || 1));
                            setManagerEditRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, quantity: val } : r))
                            );
                          }}
                          className="w-20 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-center font-mono text-white"
                        />
                        {managerEditRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setManagerEditRows((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-rose-400 hover:bg-rose-500/10 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={managerAddProductId}
                    onChange={(e) => setManagerAddProductId(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                  >
                    <option value="">{tf('+ Add product to order...', '+ Ongeramo igicuruzwa...')}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stock_name || 'Main'})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!managerAddProductId}
                    onClick={() => {
                      const prod = products.find((p) => p.id === Number(managerAddProductId));
                      if (!prod) return;
                      setManagerEditRows((prev) => [
                        ...prev,
                        {
                          product_id: prod.id,
                          product_name: prod.name,
                          sold_unit: getRetailUnitLabel(prod),
                          sale_mode: 'retail',
                          quantity: 1,
                          leg_type: (prod as any).leg_type === 'warehouse' ? 'warehouse' : 'shop'
                        }
                      ]);
                      setManagerAddProductId('');
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 text-xs font-bold text-amber-300 border border-slate-700"
                  >
                    {tf('Add', 'Ongeramo')}
                  </button>
                </div>
              </div>
            )}

            {managerAction === 'reassign_supervisor' && (
              <div>
                <label className="text-xs font-semibold text-slate-300">
                  {tf('Assign New Step-2 Supervisor *', 'Hitamo Umugenzuzi Mushya wa #2 *')}
                </label>
                <select
                  required
                  value={managerReassignSupId}
                  onChange={(e) => setManagerReassignSupId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                >
                  <option value="">{tf('Select active supervisor...', 'Hitamo umugenzuzi...')}</option>
                  {activeSupervisors.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} ({sup.job_title || sup.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-300">
                {tf('Resolution Note', 'Inyandiko y’Umwanzuro')}
              </label>
              <input
                type="text"
                value={managerNote}
                onChange={(e) => setManagerNote(e.target.value)}
                placeholder={tf('Document what was checked or changed...', 'Andika ibyakosowe cyangwa ibyemejwe...')}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setManagerTargetOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
              >
                {tf('Cancel', 'Hagarika')}
              </button>
              <button
                type="submit"
                disabled={busyActionId === managerTargetOrder.id}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs"
              >
                {tf('Apply Manager Action', 'Emeza Icyemezo')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
