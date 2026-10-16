import { describe, expect, it } from 'vitest';

import { User } from '../src/features/users/users.model.js';
import { IdentityVerification } from '../src/features/identity_verifications/identity_verifications.model.js';

describe('UC03 Mongoose Models and Indexes', () => {
  describe('User model', () => {
    it('has verificationStatus field with unverified default and correct enum values', () => {
      const path = User.schema.path('verificationStatus') as any;
      expect(path).toBeDefined();
      expect(path.defaultValue).toBe('unverified');
      expect(path.enumValues).toEqual(
        expect.arrayContaining(['unverified', 'pending', 'verified', 'rejected']),
      );
    });

    it('has address subdocument with province, district, ward, street fields', () => {
      const addressSchema = (User.schema.path('address') as any)?.schema;
      expect(addressSchema).toBeDefined();
      expect(addressSchema.path('province')).toBeDefined();
      expect(addressSchema.path('district')).toBeDefined();
      expect(addressSchema.path('ward')).toBeDefined();
      expect(addressSchema.path('street')).toBeDefined();
    });

    it('has idCardNumber field and partial unique index for verified ID card', () => {
      const idCardPath = User.schema.path('idCardNumber');
      expect(idCardPath).toBeDefined();

      const indexes = User.schema.indexes();
      const verifiedIdIndex = indexes.find(([fields, opts]) => {
        return (
          fields.idCardNumber === 1 &&
          opts?.unique === true &&
          opts?.partialFilterExpression?.idCardNumber
        );
      });
      expect(verifiedIdIndex).toBeDefined();
    });
  });

  describe('IdentityVerification model', () => {
    it('has status field with default pending and correct enum values', () => {
      const path = IdentityVerification.schema.path('status') as any;
      expect(path).toBeDefined();
      expect(path.defaultValue).toBe('pending');
      expect(path.enumValues).toEqual(
        expect.arrayContaining(['pending', 'verified', 'rejected']),
      );
    });

    it('has StoredIdentityImage subdocument schema for frontImage, backImage, and selfie', () => {
      for (const field of ['frontImage', 'backImage', 'selfie'] as const) {
        const subSchema = (IdentityVerification.schema.path(field) as any)?.schema;
        expect(subSchema).toBeDefined();
        expect(subSchema.path('publicId')).toBeDefined();
        expect(subSchema.path('deliveryType')).toBeDefined();
      }
    });

    it('has phone, idCardNumber, rejectionReason, reviewedAt, and reviewedBy fields', () => {
      expect(IdentityVerification.schema.path('phone')).toBeDefined();
      expect(IdentityVerification.schema.path('idCardNumber')).toBeDefined();
      expect(IdentityVerification.schema.path('rejectionReason')).toBeDefined();
      expect(IdentityVerification.schema.path('reviewedAt')).toBeDefined();
      expect(IdentityVerification.schema.path('reviewedBy')).toBeDefined();
    });

    it('has one_pending_per_user partial unique index, user_history, and admin_queue indexes', () => {
      const indexes = IdentityVerification.schema.indexes();

      const onePending = indexes.find(([fields, opts]) => {
        return (
          fields.userId === 1 &&
          opts?.unique === true &&
          opts?.partialFilterExpression?.status === 'pending'
        );
      });
      expect(onePending).toBeDefined();

      const userHistory = indexes.find(([fields]) => fields.userId === 1 && fields.submittedAt === -1);
      expect(userHistory).toBeDefined();

      const adminQueue = indexes.find(([fields]) => fields.status === 1 && fields.submittedAt === 1);
      expect(adminQueue).toBeDefined();
    });
  });
});
