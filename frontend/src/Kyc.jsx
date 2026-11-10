import React, { useState } from 'react';
import { ArrowRight, BadgeCheck, FileText, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { api } from './api';
import { Badge, Button, dateShort, dayInput, FormField, Modal, useAuth, useToast } from './common';

const statusCopy = {
  'Not submitted': 'Upload your driving licence for administrator review before booking a self-drive vehicle.',
  Pending: 'Your licence is with the Roam team for review. This usually requires an administrator to approve it.',
  Verified: 'Your licence is verified. You can book self-drive vehicles while it remains valid through the return date.',
  Rejected: 'Your licence needs to be submitted again. Review the administrator’s reason below.',
  Expired: 'Your verified licence has expired. Submit your renewed licence, or choose an eligible car with a driver.',
};

export function LicenseVerification() {
  const { user, setUser } = useAuth();
  const show = useToast();
  const [form, setForm] = useState({ license_number: user.license_number || '', license_expiry: user.license_expiry || '' });
  const [document, setDocument] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(user.kyc_status !== 'Verified');
  const status = user.kyc_status || 'Not submitted';

  async function submit(event) {
    event.preventDefault();
    if (!document) { show('Select your licence image or PDF.', 'error'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('license_number', form.license_number);
      body.append('license_expiry', form.license_expiry);
      body.append('document', document);
      const result = await api('/kyc', { method: 'POST', body });
      setUser(result.user);
      setDocument(null);
      setFileKey(key => key + 1);
      setEditing(false);
      show(result.message);
    } catch (error) { show(error.message, 'error'); }
    finally { setBusy(false); }
  }

  return <section className="kyc-card card-surface" aria-labelledby="kyc-heading">
    <div className="kyc-heading">
      <span className="kyc-heading-icon"><ShieldCheck size={23}/></span>
      <div><h2 id="kyc-heading">Driving licence & KYC</h2><p>Required for self-drive rentals, not for bookings with a driver.</p></div>
      <Badge status={status}/>
    </div>
    <div className={'kyc-status-copy kyc-' + status.toLowerCase().replaceAll(' ', '-')}>
      {status === 'Verified' ? <BadgeCheck size={18}/> : <ShieldAlert size={18}/>}
      <div><p>{statusCopy[status] || statusCopy['Not submitted']}</p>
        {user.license_number && <small>Licence {user.license_number} · Expires {dateShort(user.license_expiry)}</small>}
        {status === 'Rejected' && user.kyc_rejection_reason && <strong>Reason: {user.kyc_rejection_reason}</strong>}
      </div>
    </div>
    {user.has_license_document && <a className="kyc-document-link" href="/api/kyc/document" target="_blank" rel="noreferrer"><FileText size={15}/> View your submitted document</a>}
    {!editing && status === 'Verified' ? <Button variant="outline" onClick={() => setEditing(true)}>Update or renew licence <ArrowRight size={15}/></Button> :
      !editing && status === 'Pending' ? <Button variant="outline" onClick={() => setEditing(true)}>Replace submission</Button> :
      <form className="kyc-form" onSubmit={submit}>
        <div className="form-row">
          <FormField label="Driving licence number"><input required minLength="5" maxLength="50" value={form.license_number} onChange={event => setForm({ ...form, license_number: event.target.value })} placeholder="e.g. WB0120240012345"/></FormField>
          <FormField label="Licence expiry date"><input required type="date" min={dayInput(1)} value={form.license_expiry} onChange={event => setForm({ ...form, license_expiry: event.target.value })}/></FormField>
        </div>
        <FormField label="Licence document" help="Front of your licence. JPG, PNG, WebP or PDF, up to 5 MB.">
          <label className="kyc-file-input"><Upload size={17}/><span>{document ? document.name : 'Choose licence image or PDF'}</span><input key={fileKey} required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setDocument(event.target.files?.[0] || null)}/></label>
        </FormField>
        <div className="kyc-form-actions">
          {editing && <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>}
          <Button disabled={busy}>{busy ? 'Uploading securely...' : 'Submit for verification'} <ArrowRight size={15}/></Button>
        </div>
      </form>}
    <p className="kyc-privacy"><ShieldCheck size={14}/> Your document is private and accessible only to you and administrators.</p>
  </section>;
}

export function KycReviewModal({ customer, onClose, onReviewed }) {
  const show = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function review(status) {
    if (status === 'Rejected' && reason.trim().length < 3) { show('Enter a reason for rejecting this licence.', 'error'); return; }
    setBusy(true);
    try {
      const result = await api(`/admin/customers/${customer.id}/kyc`, { method: 'POST', body: { status, reason } });
      show(result.message);
      onReviewed();
    } catch (error) { show(error.message, 'error'); }
    finally { setBusy(false); }
  }

  return <Modal title="Review driving licence" subtitle={`Verify ${customer.name}’s KYC submission.`} onClose={onClose}>
    <div className="kyc-review-details">
      <div><span>Licence number</span><strong>{customer.license_number || '—'}</strong></div>
      <div><span>Expiry date</span><strong>{dateShort(customer.license_expiry)}</strong></div>
      <div><span>Submitted</span><strong>{dateShort(customer.kyc_submitted_at)}</strong></div>
    </div>
    {customer.has_license_document && <a className="button button-outline full-button" href={`/api/admin/customers/${customer.id}/kyc/document`} target="_blank" rel="noreferrer"><FileText size={16}/> Open licence document</a>}
    <p className="modal-copy">Check that the document belongs to this customer, the number matches, and the licence covers the intended rental dates.</p>
    <FormField label="Rejection reason" help="Required only when rejecting; it will be shown to the customer.">
      <textarea rows="3" maxLength="500" value={reason} onChange={event => setReason(event.target.value)} placeholder="e.g. The expiry date is not readable"/>
    </FormField>
    <div className="modal-actions kyc-review-actions">
      <Button type="button" variant="outline" disabled={busy} onClick={() => review('Rejected')}>Reject</Button>
      <Button type="button" disabled={busy} onClick={() => review('Verified')}><BadgeCheck size={16}/>{busy ? 'Saving...' : 'Approve licence'}</Button>
    </div>
  </Modal>;
}
