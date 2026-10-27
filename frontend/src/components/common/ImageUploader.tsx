import { PlusOutlined } from '@ant-design/icons'
import { App, Upload } from 'antd'
import type { UploadFile, UploadProps } from 'antd'
import { useState } from 'react'

import type { UploadPurpose } from '../../constants/domain'
import { getErrorMessage } from '../../services/api-error'
import { uploadImage } from '../../services/upload'
import type { UploadedImage } from '../../services/upload'

interface ImageUploaderProps {
  // Decides the Cloudinary folder and whether the image is private (signed by the backend).
  purpose: UploadPurpose
  value?: UploadedImage[]
  onChange?: (images: UploadedImage[]) => void
  maxCount?: number
  maxSizeMb?: number
  disabled?: boolean
  // Lets the parent disable its submit button while photos are still uploading.
  onUploadingChange?: (uploading: boolean) => void
}

const toUploadFile = (image: UploadedImage): UploadFile<UploadedImage> => ({
  uid: image.publicId,
  name: image.publicId.split('/').pop() ?? image.publicId,
  status: 'done',
  url: image.url,
  response: image,
})

// Picture-card uploader: each file goes straight to Cloudinary with a signature from
// POST /uploads/signature, and onChange receives the uploaded images. The file list is kept
// inside; remount the component (e.g. with a new key) to clear it.
export function ImageUploader({
  purpose,
  value,
  onChange,
  maxCount = 10,
  maxSizeMb = 10,
  disabled,
  onUploadingChange,
}: ImageUploaderProps) {
  const { message } = App.useApp()
  const [fileList, setFileList] = useState<UploadFile<UploadedImage>[]>(() =>
    (value ?? []).map(toUploadFile),
  )

  const beforeUpload: UploadProps<UploadedImage>['beforeUpload'] = (file) => {
    if (!file.type.startsWith('image/')) {
      message.error('Chỉ chấp nhận tệp ảnh.')
      return Upload.LIST_IGNORE
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      message.error(`Mỗi ảnh tối đa ${maxSizeMb} MB.`)
      return Upload.LIST_IGNORE
    }
    return true
  }

  const customRequest: UploadProps<UploadedImage>['customRequest'] = ({
    file,
    onProgress,
    onSuccess,
    onError,
  }) => {
    uploadImage(file as Blob, purpose, (percent) => onProgress?.({ percent }))
      .then((image) => onSuccess?.(image))
      .catch((error: unknown) => {
        message.error(getErrorMessage(error, 'Tải ảnh lên thất bại. Vui lòng thử lại.'))
        onError?.(error instanceof Error ? error : new Error('Upload failed'))
      })
  }

  const handleChange: UploadProps<UploadedImage>['onChange'] = ({ fileList: next }) => {
    const kept = next.filter((file) => file.status !== 'error')
    setFileList(kept)
    onUploadingChange?.(kept.some((file) => file.status === 'uploading'))
    onChange?.(
      kept.flatMap((file) => (file.status === 'done' && file.response ? [file.response] : [])),
    )
  }

  return (
    <Upload<UploadedImage>
      listType="picture-card"
      accept="image/*"
      multiple
      fileList={fileList}
      maxCount={maxCount}
      disabled={disabled}
      beforeUpload={beforeUpload}
      customRequest={customRequest}
      onChange={handleChange}
    >
      {fileList.length >= maxCount ? null : (
        <div className="flex flex-col items-center gap-1">
          <PlusOutlined />
          <span>Tải ảnh</span>
        </div>
      )}
    </Upload>
  )
}
