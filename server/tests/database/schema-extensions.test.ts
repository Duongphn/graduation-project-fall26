import { describe, expect, it } from 'vitest';

import { AuditLogModel } from '../../src/features/audit_logs/audit_logs.model.js';
import { CategoryModel } from '../../src/features/categories/categories.model.js';
import { DonationRequestModel } from '../../src/features/donation_requests/donation_requests.model.js';
import { IdentityVerificationModel } from '../../src/features/identity_verifications/identity_verifications.model.js';
import { OrganizationModel } from '../../src/features/organizations/organizations.model.js';
import { SystemSettingModel } from '../../src/features/system_settings/system_settings.model.js';
import { getNumberSetting } from '../../src/features/system_settings/system_settings.repository.js';
import { UserModel } from '../../src/features/users/users.model.js';
import { buildAuditLog } from '../../src/infrastructure/database/audit.js';
import { newId, useTestDatabase } from './helpers.js';

useTestDatabase();

const organization = (overrides: Record<string, unknown> = {}) => ({
  name: 'Mái ấm Hoa Hồng',
  address: '12 Lê Lợi',
  contactInfo: 'Chị Lan',
  supportCriteria: 'Đồ chơi cho trẻ 3-8 tuổi',
  ...overrides,
});

describe('schema extensions', () => {
  it('treats category names that differ only by case as duplicates', async () => {
    // syncDatabase seeds the default categories; start from an empty collection.
    await CategoryModel.deleteMany({});
    await CategoryModel.create({ name: 'Đồ chơi gỗ', slug: 'do-choi-go' });
    await expect(CategoryModel.create({ name: 'đồ CHƠI GỖ', slug: 'x-1' })).rejects.toThrow(
      /duplicate key/,
    );
    // Accents still make a different name.
    await expect(CategoryModel.create({ name: 'Do choi go', slug: 'x-2' })).resolves.toBeDefined();
  });

  it('treats organization names that differ only by case as duplicates', async () => {
    await OrganizationModel.create(organization());
    await expect(
      OrganizationModel.create(organization({ name: 'MÁI ẤM HOA HỒNG' })),
    ).rejects.toThrow(/duplicate key/);
  });

  it('validates the new organization fields', async () => {
    const created = await OrganizationModel.create(
      organization({
        name: 'Làng trẻ SOS',
        province: 'Đà Nẵng',
        phone: '+84912345678',
        ageGroups: ['AGE_3_5', 'AGE_6_8'],
        logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
        description: 'Nhận đồ chơi đã qua sử dụng.',
      }),
    );
    expect(created.ageGroups).toEqual(['AGE_3_5', 'AGE_6_8']);
    // Earlier documents without the new fields stay valid.
    expect((await OrganizationModel.create(organization({ name: 'Cũ' }))).ageGroups).toEqual([]);

    await expect(
      OrganizationModel.create(organization({ name: 'A', province: 'Hà Tây' })),
    ).rejects.toThrow(/province/);
    await expect(
      OrganizationModel.create(organization({ name: 'B', phone: '0912345678' })),
    ).rejects.toThrow(/phone/);
    await expect(
      OrganizationModel.create(organization({ name: 'C', ageGroups: ['AGE_99'] })),
    ).rejects.toThrow(/ageGroups/);
    await expect(
      OrganizationModel.create(organization({ name: 'D', status: 'PENDING' })),
    ).rejects.toThrow(/status/);
  });

  it('stores private identity images as publicId and format', async () => {
    await expect(
      IdentityVerificationModel.create({
        userId: newId(),
        frontImage: { publicId: 'a' },
        backImage: { publicId: 'b', format: 'jpg' },
        selfieImage: { publicId: 'c', format: 'jpg' },
      }),
    ).rejects.toThrow(/format/);
  });

  it('keeps an optional date of birth on users', async () => {
    const user = await UserModel.create({
      phone: '0911111111',
      email: 'dob@example.com',
      passwordHash: 'hash',
      fullName: 'Bình',
      dateOfBirth: new Date('2000-01-02'),
    });
    expect(user.dateOfBirth?.toISOString()).toBe('2000-01-02T00:00:00.000Z');
  });

  it('accepts audit logs for categories and organizations, with or without a target id', async () => {
    await expect(
      AuditLogModel.create([
        buildAuditLog({
          actorType: 'ADMIN',
          actorId: newId().toString(),
          action: 'category.reorder',
          target: { kind: 'CATEGORY' },
        }),
        buildAuditLog({
          actorType: 'ADMIN',
          action: 'organization.hide',
          target: { kind: 'ORGANIZATION', id: newId().toString() },
          meta: { before: { status: 'ACTIVE' }, after: { status: 'HIDDEN' } },
        }),
      ]),
    ).resolves.toHaveLength(2);
    await expect(
      AuditLogModel.create({
        actorType: 'ADMIN',
        action: 'CATEGORY_CREATED',
        target: { kind: 'CATEGORY' },
      }),
    ).rejects.toThrow(/action/);
  });

  it('lists organization requests through the organization_requests index', async () => {
    const organizationId = newId();
    await DonationRequestModel.create({
      code: 'D-1',
      toyId: newId(),
      donorId: newId(),
      requestedBy: newId(),
      receiverType: 'ORGANIZATION',
      organizationId,
    });
    const plan = (await DonationRequestModel.find({
      receiverType: 'ORGANIZATION',
      organizationId,
      status: 'PENDING',
    })
      .explain('queryPlanner')
      .exec()) as unknown as Array<{ queryPlanner: { winningPlan: unknown } }>;
    const winning = JSON.stringify(
      (Array.isArray(plan) ? plan[0] : plan)?.queryPlanner.winningPlan,
    );
    expect(winning).toContain('organization_requests');
  });

  it('seeds the default settings without overwriting changed values', async () => {
    expect(await getNumberSetting('TOY_MIN_PHOTOS_SALE')).toBe(4);
    expect(await getNumberSetting('USER_MIN_AGE_YEARS')).toBe(18);
    await SystemSettingModel.updateOne({ key: 'TOY_MIN_PHOTOS_RENT' }, { value: 5 });
    const { seedDefaultSettings } =
      await import('../../src/features/system_settings/system_settings.repository.js');
    await seedDefaultSettings();
    expect(await getNumberSetting('TOY_MIN_PHOTOS_RENT')).toBe(5);
  });
});
