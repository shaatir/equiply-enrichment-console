export default function EquipmentTable({ rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Manufacturer</th>
            <th>Model</th>
            <th>Serial number</th>
            <th>Manufactured date</th>
            <th>Device type</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.serial_number}-${index}`}>
              <td>{row.manufacturer || 'Unknown'}</td>
              <td>{row.model || 'Unknown'}</td>
              <td className="mono">{row.serial_number || 'Missing'}</td>
              <td>{row.manufactured_date}</td>
              <td>
                <span className="type-pill">{row.device_type}</span>
              </td>
              <td>{row.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
