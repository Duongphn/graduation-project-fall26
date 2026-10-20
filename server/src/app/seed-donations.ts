// Sample data for testing the donation pages (UC27) on a shared database.
//   npm run seed:donations              add the sample data (skipped when it is already there)
//   npm run seed:donations -- --remove  delete every sample record and what the flows created
// Every record is easy to spot: names start with "[SEED]", emails end with "@seed.toyflow.test".
// The donation requests themselves are created through the API (see the README of
// donation_requests), so their history, notifications and audit rows are real.
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';

import { env } from '../config/env.js';
import { AuditLogModel } from '../features/audit_logs/audit_logs.model.js';
import { CategoryModel } from '../features/categories/categories.model.js';
import { DonationRequestModel } from '../features/donation_requests/donation_requests.model.js';
import { IdentityVerificationModel } from '../features/identity_verifications/identity_verifications.model.js';
import { NotificationModel } from '../features/notifications/notifications.model.js';
import { OrderStatusHistoryModel } from '../features/order_status_history/order_status_history.model.js';
import { OrganizationModel } from '../features/organizations/organizations.model.js';
import { ToyModel } from '../features/toys/toys.model.js';
import { UserModel } from '../features/users/users.model.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/mongoose.js';

const SEED = '[SEED]';
const EMAIL_DOMAIN = '@seed.toyflow.test';
const PASSWORD = 'Seed@12345';
const SAMPLE_IMAGE = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

const users = [
  { key: 'donor', fullName: `${SEED} Người tặng`, phone: '0900000101', role: 'USER' },
  { key: 'receiver', fullName: `${SEED} Người nhận`, phone: '0900000102', role: 'USER' },
  { key: 'admin', fullName: `${SEED} Admin`, phone: '0900000103', role: 'ADMIN' },
] as const;

const organizations = [
  {
    name: `${SEED} Mái ấm Hoa Hồng`,
    province: 'Hồ Chí Minh',
    address: '12 Nguyễn Văn Trỗi, Phường 8, Phú Nhuận',
    contactInfo: 'Sơ Maria Nguyễn Thị Hoa — Quản lý mái ấm',
    phone: '+84901234561',
    ageGroups: ['AGE_0_2', 'AGE_3_5', 'AGE_6_8'],
    supportCriteria: 'Đồ chơi giáo dục, xếp hình gỗ, sách tranh cho trẻ 0–8 tuổi.',
    description: 'Mái ấm nuôi dưỡng 45 em nhỏ mồ côi và có hoàn cảnh khó khăn từ năm 2008.',
  },
  {
    name: `${SEED} Trường tình thương Hy Vọng`,
    province: 'Hồ Chí Minh',
    address: '45 Lê Văn Việt, Hiệp Phú, Thủ Đức',
    contactInfo: 'Cô Trần Thu Hà — Hiệu trưởng',
    phone: '+84901234562',
    ageGroups: ['AGE_6_8', 'AGE_9_12'],
    supportCriteria: 'Bộ STEM, đồ chơi khoa học, cờ và trò chơi nhóm.',
    description: 'Lớp học tình thương miễn phí cho trẻ bán vé số và con công nhân.',
  },
  {
    name: `${SEED} Làng trẻ em Bình Minh`,
    province: 'Hà Nội',
    address: '8 Phạm Văn Đồng, Cầu Giấy',
    contactInfo: 'Anh Lê Minh Khang — Điều phối viên',
    phone: '+84901234563',
    ageGroups: ['AGE_3_5', 'AGE_6_8', 'AGE_9_12', 'AGE_13_PLUS'],
    supportCriteria: 'Xe đạp trẻ em, bóng, đồ chơi vận động ngoài trời.',
    description: null,
  },
  {
    name: `${SEED} Khoa Nhi Bệnh viện Đà Nẵng`,
    province: 'Đà Nẵng',
    address: '124 Hải Phòng, Thạch Thang, Hải Châu',
    contactInfo: 'Chị Phạm Lan — Công tác xã hội',
    phone: '+84901234564',
    ageGroups: ['AGE_0_2', 'AGE_3_5'],
    supportCriteria: 'Đồ chơi mới hoặc đã khử khuẩn, không có chi tiết nhỏ.',
    description: 'Góc vui chơi cho bệnh nhi điều trị dài ngày.',
  },
  {
    name: `${SEED} Mái ấm Thiên Thần`,
    province: 'Cần Thơ',
    address: '22 Trần Hưng Đạo, Ninh Kiều',
    contactInfo: 'Sơ Anna Lê — Quản lý',
    phone: '+84901234565',
    ageGroups: [],
    supportCriteria: 'Mọi loại đồ chơi còn tốt.',
    description: null,
  },
  {
    name: `${SEED} Nhà mở Ánh Dương`,
    province: 'Huế',
    address: '3 Lê Lợi, Vĩnh Ninh',
    contactInfo: 'Thầy Nguyễn Văn An',
    phone: '+84901234566',
    ageGroups: ['AGE_9_12', 'AGE_13_PLUS'],
    supportCriteria: 'Sách, board game, dụng cụ thể thao cho thiếu niên.',
    description: 'Nhà mở cho trẻ lang thang, có lớp học nghề buổi tối.',
  },
] as const;

const toys = [
  { title: `${SEED} Bộ xếp hình Lego tàu hoả 100 chi tiết`, ageGroup: 'AGE_3_5', condition: 'LIKE_NEW' },
  { title: `${SEED} Bảng chữ cái điện tử song ngữ`, ageGroup: 'AGE_3_5', condition: 'GOOD' },
  { title: `${SEED} Xe tập đi gỗ`, ageGroup: 'AGE_0_2', condition: 'GOOD' },
  { title: `${SEED} Bộ STEM lắp robot`, ageGroup: 'AGE_9_12', condition: 'NEW' },
] as const;

const seedEmail = (key: string) => `${key}${EMAIL_DOMAIN}`;

/** The donor may post toys only with a VERIFIED identity verification (toy listing rule). */
const verifyDonor = (userId: Types.ObjectId) =>
  IdentityVerificationModel.create({
    userId,
    status: 'VERIFIED',
    frontImage: { publicId: 'toyflow/identity/seed-front', format: 'jpg' },
    backImage: { publicId: 'toyflow/identity/seed-back', format: 'jpg' },
    selfieImage: { publicId: 'toyflow/identity/seed-selfie', format: 'jpg' },
    reviewedAt: new Date(),
  });

const add = async () => {
  const existingDonor = await UserModel.findOne({ email: seedEmail('donor') }).select('_id').lean();
  if (existingDonor) {
    // Sample data from an earlier run: only add what later versions of this script add.
    if (!(await IdentityVerificationModel.exists({ userId: existingDonor._id }))) {
      await verifyDonor(existingDonor._id);
      console.info('Added the identity verification of the sample donor.');
    }
    console.info('Sample data is already there. Remove it first: npm run seed:donations -- --remove');
    return;
  }
  const category = await CategoryModel.findOne().select('_id').lean();
  if (!category) throw new Error('No category in the database: add categories first.');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const created = await UserModel.insertMany(
    users.map((user) => ({
      email: seedEmail(user.key),
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      passwordHash,
    })),
  );
  const donor = created[0]!;
  await verifyDonor(donor._id);

  await OrganizationModel.insertMany(organizations.map((org) => ({ ...org, status: 'ACTIVE' })));
  const toyDocs = await ToyModel.insertMany(
    toys.map((toy) => ({
      ...toy,
      ownerId: donor._id,
      categoryId: category._id,
      description: 'Đồ chơi mẫu để test luồng quyên góp.',
      images: [SAMPLE_IMAGE],
      listingType: 'DONATION',
      status: 'ACTIVE',
    })),
  );

  console.info(`Added ${created.length} users, ${organizations.length} organizations, ${toyDocs.length} toys.`);
  console.info(`Sign in with ${users.map((user) => seedEmail(user.key)).join(', ')} / ${PASSWORD}`);
  console.info(
    'Ids:',
    JSON.stringify({
      users: Object.fromEntries(users.map((user, index) => [user.key, String(created[index]!._id)])),
      toys: toyDocs.map((toy) => String(toy._id)),
    }),
  );
};

const remove = async () => {
  const userIds = (
    await UserModel.find({ email: { $regex: `${EMAIL_DOMAIN.replace(/\./g, '\\.')}$` } }).select('_id').lean()
  ).map((user) => user._id);
  const toyIds = (await ToyModel.find({ title: { $regex: '^\\[SEED\\]' } }).select('_id').lean()).map(
    (toy) => toy._id,
  );
  const requestIds = (await DonationRequestModel.find({ toyId: { $in: toyIds } }).select('_id').lean()).map(
    (request) => request._id,
  );

  const results = {
    orderStatusHistory: await OrderStatusHistoryModel.deleteMany({ orderType: 'DONATION', orderId: { $in: requestIds } }),
    donationRequests: await DonationRequestModel.deleteMany({ _id: { $in: requestIds } }),
    toys: await ToyModel.deleteMany({ _id: { $in: toyIds } }),
    organizations: await OrganizationModel.deleteMany({ name: { $regex: '^\\[SEED\\]' } }),
    notifications: await NotificationModel.deleteMany({ userId: { $in: userIds } }),
    identityVerifications: await IdentityVerificationModel.deleteMany({ userId: { $in: userIds } }),
    auditLogs: await AuditLogModel.deleteMany({ actorId: { $in: userIds as Types.ObjectId[] } }),
    // Donation posts created while testing (POST /toys, listingType donate) by the sample users.
    userToys: await ToyModel.deleteMany({ ownerId: { $in: userIds } }),
    users: await UserModel.deleteMany({ _id: { $in: userIds } }),
  };
  console.info(
    'Removed:',
    JSON.stringify(Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.deletedCount]))),
  );
};

const run = async () => {
  await connectDatabase(env.mongoDbUri);
  try {
    await (process.argv.includes('--remove') ? remove() : add());
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error: unknown) => {
  console.error('Seed failed.', error);
  process.exit(1);
});
