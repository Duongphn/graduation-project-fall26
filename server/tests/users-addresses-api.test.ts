import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { errorHandler } from '../src/middlewares/error-handler.js';
import { Address, User } from '../src/models/index.js';
import { createUsersRouter } from '../src/routes/user.routes.js';
import { AddressService } from '../src/services/address.service.js';
import { UsersService } from '../src/services/user.service.js';
import { testAuth } from './support/test-auth.js';
import { useTestDatabase } from './support/test-database.js';

// UC03 / R03 III.6.1.1 (9)–(11): several delivery addresses, one default, add / edit / delete.
useTestDatabase();

const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/api/v1/users', createUsersRouter(new UsersService(User), new AddressService()));
app.use(errorHandler);

const HOME = { recipientName: 'Nguyễn Thị Lan', phone: '0912345678', province: 'Hà Nội', ward: 'Phường Cầu Giấy', street: '12 Xuân Thủy' };
const OFFICE = { recipientName: 'Trần Văn Nam', phone: '0987654321', province: 'TP. Hồ Chí Minh', ward: 'Phường Bến Nghé', street: '5 Lê Lợi' };
const GRANDMA = { recipientName: 'Lê Thị Hoa', phone: '0901111222', province: 'Đà Nẵng', ward: 'Phường Hải Châu', street: '9 Bạch Đằng' };

let userId: string;
let otherId: string;
const as = (id: string) => ({ 'x-test-user': id });
const list = async (id = userId) => (await request(app).get('/api/v1/users/addresses').set(as(id))).body.data as Array<{ id: string; street: string; isDefault: boolean }>;
const add = (body: object, id = userId) => request(app).post('/api/v1/users/addresses').set(as(id)).send(body);

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Address.deleteMany({})]);
  const [user, other] = await User.create([
    { email: 'lan@example.com', phone: '0912345678', passwordHash: 'x', fullName: 'Nguyễn Thị Lan' },
    { email: 'nam@example.com', phone: '0987654321', passwordHash: 'x', fullName: 'Trần Văn Nam' },
  ]);
  userId = user!._id.toString();
  otherId = other!._id.toString();
});

describe('Sổ địa chỉ /users/addresses', () => {
  it('keeps several addresses; the first one becomes the default and is listed first', async () => {
    const first = await add(HOME);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ ...HOME, isDefault: true });
    expect((await add(OFFICE)).body.data.isDefault).toBe(false);

    const ticked = await add({ ...GRANDMA, isDefault: true });
    expect(ticked.body.data.isDefault).toBe(true);

    const addresses = await list();
    expect(addresses.map((a) => a.street)).toEqual([GRANDMA.street, HOME.street, OFFICE.street]);
    expect(addresses.filter((a) => a.isDefault)).toHaveLength(1);
  });

  it('edits an address and moves the default label to it', async () => {
    await add(HOME);
    const office = (await add(OFFICE)).body.data;

    const res = await request(app)
      .patch(`/api/v1/users/addresses/${office.id}`)
      .set(as(userId))
      .send({ street: '7 Lê Lợi', isDefault: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ street: '7 Lê Lợi', isDefault: true });

    const addresses = await list();
    expect(addresses[0]).toMatchObject({ id: office.id, isDefault: true });
    expect(addresses[1]!.isDefault).toBe(false);
  });

  it('deletes an address; deleting the default makes the oldest remaining address the default', async () => {
    const home = (await add(HOME)).body.data;
    const office = (await add(OFFICE)).body.data;
    await add(GRANDMA);

    expect((await request(app).delete(`/api/v1/users/addresses/${home.id}`).set(as(userId))).status).toBe(204);
    const addresses = await list();
    expect(addresses.map((a) => a.street)).toEqual([OFFICE.street, GRANDMA.street]);
    expect(addresses[0]).toMatchObject({ id: office.id, isDefault: true });
    // R04 3.26: hidden, not deleted
    expect(await Address.findById(home.id).lean()).toMatchObject({ status: 'hidden' });
  });

  it('validates the fields of R03 III.6.1.1 (10)', async () => {
    for (const body of [
      { ...HOME, recipientName: 'A' },
      { ...HOME, phone: '912345678' },
      { ...HOME, phone: '+84912345678' },
      { ...HOME, street: 'ab' },
      { ...HOME, province: '' },
      { ...HOME, district: 'Cầu Giấy' },
    ]) {
      const res = await add(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await list()).toEqual([]);
  });

  it("cannot read, edit or delete another user's address", async () => {
    const theirs = (await add(OFFICE, otherId)).body.data;
    expect(await list()).toEqual([]);
    expect((await request(app).patch(`/api/v1/users/addresses/${theirs.id}`).set(as(userId)).send({ street: '1 Phố Huế' })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/users/addresses/${theirs.id}`).set(as(userId))).status).toBe(404);
    expect((await list(otherId))[0]).toMatchObject({ street: OFFICE.street, isDefault: true });
  });

  it('turns the old single profile address into the default address', async () => {
    await User.collection.updateOne(
      { email: 'lan@example.com' },
      { $set: { address: { province: 'Hà Nội', district: 'Cầu Giấy', ward: 'Dịch Vọng', street: '1 Xuân Thủy' } } },
    );
    const addresses = await list();
    expect(addresses).toEqual([
      expect.objectContaining({ recipientName: 'Nguyễn Thị Lan', phone: '0912345678', province: 'Hà Nội', ward: 'Dịch Vọng, Cầu Giấy', street: '1 Xuân Thủy', isDefault: true }),
    ]);
    expect((await User.findById(userId).lean())!.address).toBeUndefined();
    expect(await list()).toHaveLength(1);
  });

  it('requires a signed-in user', async () => {
    expect((await request(app).get('/api/v1/users/addresses')).status).toBe(401);
  });
});
