import { describe, expect, it } from 'vitest';
import {
  createEmptyNotificationSnapshot,
  evaluateChainIncomingAlerts
} from '../src/utils/notificationSound';
import { Order } from '../src/types';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    shop_id: 1,
    stock_id: 1,
    order_number: 'ORD-0001',
    customer_id: 1,
    salesperson_id: 2,
    total_amount: 0,
    paid_amount: 0,
    debt_amount: 0,
    payment_status: 'paid',
    fulfillment_status: 'pending_store',
    chain_status: 'pending_supervisor_1',
    created_at: new Date().toISOString(),
    items: [],
    ...overrides
  };
}

describe('evaluateChainIncomingAlerts', () => {
  it('stays silent on initial load even when pending orders already exist', () => {
    const initialOrders = [
      makeOrder({ id: 10, order_number: 'ORD-10', chain_status: 'pending_supervisor_1' })
    ];
    const { nextSnapshot, alerts } = evaluateChainIncomingAlerts({
      userId: 5,
      canCreateOrders: false,
      canReleaseStock: false,
      canVerifyOrders: true,
      canResolveFlagged: false,
      allOrders: initialOrders,
      warehouseOrders: [],
      prevSnapshot: createEmptyNotificationSnapshot()
    });

    expect(nextSnapshot.initialized).toBe(true);
    expect(alerts).toHaveLength(0);
  });

  it('notifies verificators when a salesperson submits a new incoming order or resubmits a returned order', () => {
    const first = evaluateChainIncomingAlerts({
      userId: 5,
      canCreateOrders: false,
      canReleaseStock: false,
      canVerifyOrders: true,
      canResolveFlagged: false,
      allOrders: [makeOrder({ id: 10, order_number: 'ORD-10', chain_status: 'pending_supervisor_1' })],
      warehouseOrders: [],
      prevSnapshot: createEmptyNotificationSnapshot()
    });

    // Order 11 arrives for Verify #1
    const second = evaluateChainIncomingAlerts({
      userId: 5,
      canCreateOrders: false,
      canReleaseStock: false,
      canVerifyOrders: true,
      canResolveFlagged: false,
      allOrders: [
        makeOrder({ id: 10, order_number: 'ORD-10', chain_status: 'pending_supervisor_1' }),
        makeOrder({ id: 11, order_number: 'ORD-11', chain_status: 'pending_supervisor_1' })
      ],
      warehouseOrders: [],
      prevSnapshot: first.nextSnapshot
    });

    expect(second.alerts).toEqual([
      {
        kind: 'verify_1',
        tab: 'supervisor_1',
        orderNumbers: ['ORD-11'],
        count: 1
      }
    ]);

    // Order 11 is returned to seller -> leaves pending_supervisor_1
    const third = evaluateChainIncomingAlerts({
      userId: 5,
      canCreateOrders: false,
      canReleaseStock: false,
      canVerifyOrders: true,
      canResolveFlagged: false,
      allOrders: [
        makeOrder({ id: 10, order_number: 'ORD-10', chain_status: 'pending_supervisor_1' }),
        makeOrder({ id: 11, order_number: 'ORD-11', chain_status: 'returned_to_seller' })
      ],
      warehouseOrders: [],
      prevSnapshot: second.nextSnapshot
    });
    expect(third.alerts).toHaveLength(0);

    // Order 11 is resubmitted by salesperson -> verificator gets notified again
    const fourth = evaluateChainIncomingAlerts({
      userId: 5,
      canCreateOrders: false,
      canReleaseStock: false,
      canVerifyOrders: true,
      canResolveFlagged: false,
      allOrders: [
        makeOrder({ id: 10, order_number: 'ORD-10', chain_status: 'pending_supervisor_1' }),
        makeOrder({ id: 11, order_number: 'ORD-11', chain_status: 'pending_supervisor_1' })
      ],
      warehouseOrders: [],
      prevSnapshot: third.nextSnapshot
    });

    expect(fourth.alerts).toEqual([
      {
        kind: 'verify_1',
        tab: 'supervisor_1',
        orderNumbers: ['ORD-11'],
        count: 1
      }
    ]);
  });

  it('notifies storekeepers when warehouse stock OR main shop items are authorized by a verifier', () => {
    const init = evaluateChainIncomingAlerts({
      userId: 9,
      canCreateOrders: false,
      canReleaseStock: true,
      canVerifyOrders: false,
      canResolveFlagged: false,
      allOrders: [],
      warehouseOrders: [],
      prevSnapshot: createEmptyNotificationSnapshot()
    });

    const authorizedOrder = makeOrder({
      id: 22,
      order_number: 'ORD-22',
      chain_status: 'in_release',
      items: [
        { id: 1, product_id: 1, quantity: 2, buying_price: 0, selling_price: 0, subtotal: 0, profit: 0, leg_type: 'shop', leg_status: 'pending' },
        { id: 2, product_id: 2, quantity: 5, buying_price: 0, selling_price: 0, subtotal: 0, profit: 0, leg_type: 'warehouse', leg_status: 'pending' }
      ]
    });

    const afterAuth = evaluateChainIncomingAlerts({
      userId: 9,
      canCreateOrders: false,
      canReleaseStock: true,
      canVerifyOrders: false,
      canResolveFlagged: false,
      allOrders: [authorizedOrder],
      warehouseOrders: [authorizedOrder],
      prevSnapshot: init.nextSnapshot
    });

    expect(afterAuth.alerts).toEqual([
      { kind: 'release', tab: 'warehouse', orderNumbers: ['ORD-22'], count: 1 },
      { kind: 'release', tab: 'shop_release', orderNumbers: ['ORD-22'], count: 1 }
    ]);
  });

  it('notifies salesperson for returned orders and shop-approved releases without triggering verifier alerts', () => {
    const init = evaluateChainIncomingAlerts({
      userId: 3,
      canCreateOrders: true,
      canReleaseStock: false,
      canVerifyOrders: false,
      canResolveFlagged: false,
      allOrders: [makeOrder({ id: 30, order_number: 'ORD-30', chain_status: 'pending_supervisor_1' })],
      warehouseOrders: [],
      prevSnapshot: createEmptyNotificationSnapshot()
    });

    const next = evaluateChainIncomingAlerts({
      userId: 3,
      canCreateOrders: true,
      canReleaseStock: false,
      canVerifyOrders: false,
      canResolveFlagged: false,
      allOrders: [
        makeOrder({ id: 30, order_number: 'ORD-30', chain_status: 'returned_to_seller' }),
        makeOrder({
          id: 31,
          order_number: 'ORD-31',
          chain_status: 'in_release',
          items: [
            { id: 4, product_id: 1, quantity: 1, buying_price: 0, selling_price: 0, subtotal: 0, profit: 0, leg_type: 'shop', leg_status: 'pending' }
          ]
        }),
        makeOrder({ id: 32, order_number: 'ORD-32', chain_status: 'pending_supervisor_1' })
      ],
      warehouseOrders: [],
      prevSnapshot: init.nextSnapshot
    });

    expect(next.alerts).toEqual([
      { kind: 'release', tab: 'shop_release', orderNumbers: ['ORD-31'], count: 1 },
      { kind: 'returned', tab: 'returned', orderNumbers: ['ORD-30'], count: 1 }
    ]);
  });

  it('notifies assigned supervisor for Verify #2 when a leg is released and notifies manager on flagged discrepancy', () => {
    const baseOrder = makeOrder({
      id: 40,
      order_number: 'ORD-40',
      chain_status: 'in_release',
      first_verified_by: 5,
      items: [
        { id: 7, product_id: 2, quantity: 3, buying_price: 0, selling_price: 0, subtotal: 0, profit: 0, leg_type: 'warehouse', leg_status: 'pending' }
      ]
    });

    const supInit = evaluateChainIncomingAlerts({
      userId: 5,
      canCreateOrders: false,
      canReleaseStock: false,
      canVerifyOrders: true,
      canResolveFlagged: false,
      allOrders: [baseOrder],
      warehouseOrders: [],
      prevSnapshot: createEmptyNotificationSnapshot()
    });

    const mgrInit = evaluateChainIncomingAlerts({
      userId: 1,
      canCreateOrders: true,
      canReleaseStock: true,
      canVerifyOrders: true,
      canResolveFlagged: true,
      allOrders: [baseOrder],
      warehouseOrders: [baseOrder],
      prevSnapshot: createEmptyNotificationSnapshot()
    });

    const releasedOrder = makeOrder({
      ...baseOrder,
      items: [
        { id: 7, product_id: 2, quantity: 3, buying_price: 0, selling_price: 0, subtotal: 0, profit: 0, leg_type: 'warehouse', leg_status: 'warehouse_released' }
      ]
    });

    const supAfterRelease = evaluateChainIncomingAlerts({
      userId: 5,
      canCreateOrders: false,
      canReleaseStock: false,
      canVerifyOrders: true,
      canResolveFlagged: false,
      allOrders: [releasedOrder],
      warehouseOrders: [],
      prevSnapshot: supInit.nextSnapshot
    });

    expect(supAfterRelease.alerts).toEqual([
      { kind: 'verify_2', tab: 'supervisor_2', orderNumbers: ['ORD-40'], count: 1 }
    ]);

    const flaggedOrder = makeOrder({
      ...baseOrder,
      chain_status: 'flagged_for_manager'
    });

    const mgrAfterFlag = evaluateChainIncomingAlerts({
      userId: 1,
      canCreateOrders: true,
      canReleaseStock: true,
      canVerifyOrders: true,
      canResolveFlagged: true,
      allOrders: [flaggedOrder],
      warehouseOrders: [],
      prevSnapshot: mgrInit.nextSnapshot
    });

    expect(mgrAfterFlag.alerts).toContainEqual({
      kind: 'flagged',
      tab: 'manager_resolve',
      orderNumbers: ['ORD-40'],
      count: 1
    });
  });
});
