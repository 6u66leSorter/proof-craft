import { guestHomeworkAttachmentFileUrl, guestHomeworkFileUrl } from '../../api/files'
import { useApp } from '../../app/store'
import { homeworkMediaButtons, homeworkPhotoItems, homeworkTitle, type HomeworkBase } from '../../domain/homework'
import { Header } from '../../ui/Header'
import { ICO } from '../../ui/icons'
import { Lightbox } from '../../ui/Lightbox'
import { MediaButtons } from '../../ui/MediaButtons'
import { PhotoStrip } from '../../ui/PhotoStrip'

export function GuestHomeworkScreen() {
  const hw = useApp((s) => s.selectedHomework) as HomeworkBase | null
  if (!hw) return null
  const photoItems = homeworkPhotoItems(hw, guestHomeworkFileUrl, guestHomeworkAttachmentFileUrl)
  const buttons = homeworkMediaButtons(
    hw,
    (id) => guestHomeworkFileUrl(id, false),
    (hid, aid) => guestHomeworkAttachmentFileUrl(hid, aid, false),
    { skipPhotos: photoItems.length > 0 },
  )
  return (
    <>
      <Header title="Работа" onBack={() => useApp.getState().back()} />
      <div className="scr fi" style={{ padding: 14 }}>
        <PhotoStrip items={photoItems} />
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{homeworkTitle(hw)}</div>
          {hw.text_content && <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.5 }}>{hw.text_content}</p>}
          <div style={{ height: 10 }} />
          {hw.rating != null && (
            <div className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                <span style={{ color: 'var(--gold)' }}>{ICO.star}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{String(hw.rating)}</span>
                <span style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-body)' }}>/5</span>
              </div>
              {hw.review_comment && <p style={{ fontSize: 12, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{hw.review_comment}</p>}
              {hw.reviewer_name && (
                <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 6, fontFamily: 'var(--font-body)' }}>{hw.reviewer_name}</div>
              )}
            </div>
          )}
          <MediaButtons buttons={buttons} />
        </div>
      </div>
      <Lightbox />
    </>
  )
}
